"""Minimal ComfyUI bulk image wrapper for the school-code project.

This script deliberately shells out to the existing lyric-video helper scripts
instead of talking to the ComfyUI API directly.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import subprocess
import sys
from urllib.parse import urlparse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_HELPER_REPO = Path(r"Q:\AI\Repos\lyric-video")
DEFAULT_WORKFLOW = Path(r"workflows\comfyui\node-graphs\basic_flux_t2i.api.json")
DEFAULT_SERVER = "http://127.0.0.1:8188"
DEFAULT_COMFYUI_ROOT = r"C:\AI\ComfyUI_portable"
DEFAULT_PUZZLES_JSON = Path(r"src\apps\sentences\data\puzzles.json")

DEFAULT_STYLE_PROMPT = (
    "friendly classroom illustration, bright colors, clean shapes, soft lighting, "
    "kid-safe, educational worksheet style"
)
DEFAULT_NEGATIVE_PROMPT = (
    "words, letters, captions, labels, numbers, watermark, logo, scary, "
    "photorealistic faces, complex hands, extra fingers, clutter"
)
DEFAULT_NEGATIVE_PROMPT_ALLOW_TEXT = (
    "watermark, logo, scary, photorealistic faces, complex hands, extra fingers, "
    "clutter, misspelled text"
)
NO_TEXT_DIRECTION = (
    "Do not include words, letters, captions, labels, numbers, signs, or readable text in the image."
)


class QueueFailure(RuntimeError):
    def __init__(self, message: str, *, returncode: int = 1) -> None:
        super().__init__(message)
        self.returncode = returncode


def project_path(value: str | Path) -> Path:
    path = Path(value)
    return path if path.is_absolute() else PROJECT_ROOT / path


def helper_path(helper_repo: Path, value: str | Path) -> Path:
    path = Path(value)
    return path if path.is_absolute() else helper_repo / path


def quote_ps(value: object) -> str:
    raw = str(value)
    if raw == "":
        return '""'
    if re.fullmatch(r"[A-Za-z0-9_./:\\=-]+", raw):
        return raw
    return '"' + raw.replace("`", "``").replace('"', '`"') + '"'


def print_command(cwd: Path, command: list[str]) -> None:
    print("PowerShell equivalent:")
    print(f"  cd {quote_ps(cwd)}")
    print("  " + " ".join(quote_ps(part) for part in command))


def extract_json_object(stdout: str) -> dict[str, Any] | None:
    lines = stdout.splitlines()
    for index, line in enumerate(lines):
        if not line.lstrip().startswith("{"):
            continue
        candidate = "\n".join(lines[index:])
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def safe_id(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "_", value.strip())
    cleaned = cleaned.strip("._-")
    if not cleaned:
        raise ValueError("job id cannot be empty after filename cleanup")
    return cleaned


def text_value(row: dict[str, Any], *names: str) -> str:
    for name in names:
        value = row.get(name)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def int_value(raw: str, fallback: int, label: str) -> int:
    if raw is None or str(raw).strip() == "":
        return fallback
    try:
        return int(str(raw).strip())
    except ValueError as exc:
        raise ValueError(f"{label} must be an integer, got {raw!r}") from exc


def bool_value(raw: object) -> bool:
    if isinstance(raw, bool):
        return raw
    return str(raw).strip().lower() in {"1", "true", "yes", "y", "on"}


def build_positive_prompt(
    *,
    style_prompt: str,
    description: str,
    sentence: str,
    allow_text: bool,
) -> str:
    pieces = [
        f"{style_prompt.strip().rstrip('.')}.",
        f"Visual subject: {description.strip().rstrip('.')}.",
    ]
    if sentence.strip():
        pieces.append(
            "Sentence meaning for context only, not text to display: "
            f"{sentence.strip().rstrip('.')}."
        )
    if not allow_text:
        pieces.append(NO_TEXT_DIRECTION)
    return " ".join(piece for piece in pieces if piece)


def negative_prompt_for(args: argparse.Namespace, *, allow_text: bool) -> str:
    if allow_text and args.negative_prompt == DEFAULT_NEGATIVE_PROMPT:
        return DEFAULT_NEGATIVE_PROMPT_ALLOW_TEXT
    return args.negative_prompt


def validate_helper_paths(args: argparse.Namespace) -> None:
    helper_repo = Path(args.helper_repo)
    queue_script = helper_repo / "scripts" / "comfyui_queue.py"
    server_script = helper_repo / "scripts" / "comfyui_server.py"
    workflow = helper_path(helper_repo, args.workflow)

    missing = [
        str(path)
        for path in (helper_repo, queue_script, server_script, workflow)
        if not path.exists()
    ]
    if missing:
        raise SystemExit("Required ComfyUI helper path is missing:\n  " + "\n  ".join(missing))


def workflow_supports_negative_prompt(args: argparse.Namespace) -> bool:
    workflow = helper_path(Path(args.helper_repo), args.workflow)
    data = json.loads(workflow.read_text(encoding="utf-8"))
    for node in data.values():
        inputs = node.get("inputs", {})
        title = node.get("_meta", {}).get("title", "").lower()
        if "text" in inputs and "negative" in title:
            return True
    return False


def server_host_port(server: str) -> tuple[str, int]:
    parsed = urlparse(server)
    if not parsed.hostname:
        raise SystemExit(f"Invalid ComfyUI server URL: {server}")
    port = parsed.port
    if port is None:
        port = 443 if parsed.scheme == "https" else 80
    return parsed.hostname, port


def ensure_comfyui_reachable(args: argparse.Namespace) -> None:
    helper_repo = Path(args.helper_repo)
    host, port = server_host_port(args.server)
    command = [
        args.python,
        r"scripts\comfyui_server.py",
        "status",
        "--json",
        "--host",
        host,
        "--port",
        str(port),
    ]
    try:
        result = subprocess.run(
            command,
            cwd=helper_repo,
            text=True,
            capture_output=True,
            timeout=30,
        )
    except FileNotFoundError as exc:
        raise SystemExit(f"Could not run {args.python!r}. Is Python on PATH?") from exc
    except subprocess.TimeoutExpired as exc:
        raise SystemExit("Timed out while checking whether ComfyUI is reachable.") from exc

    status = extract_json_object(result.stdout) or {}
    server = status.get("server") or args.server
    running = bool(status.get("running"))
    if result.returncode == 0 and running:
        return

    if result.stdout.strip():
        print(result.stdout.strip())
    if result.stderr.strip():
        print(result.stderr.strip(), file=sys.stderr)
    raise SystemExit(
        f"ComfyUI is not reachable at {server}.\n"
        "Start it from PowerShell first:\n"
        f"  cd {quote_ps(helper_repo)}\n"
        f"  {quote_ps(args.python)} scripts\\comfyui_server.py start --root "
        f"{quote_ps(DEFAULT_COMFYUI_ROOT)} --host {quote_ps(host)} --port {port}\n"
        "Then rerun this command. For validation that does not contact ComfyUI, add --dry-run."
    )


def normalize_job(row: dict[str, Any], args: argparse.Namespace, index: int) -> dict[str, Any]:
    job_id = text_value(row, "id", "puzzle_id")
    sentence = text_value(row, "sentence", "solution_sentence")
    description = text_value(row, "description", "image_description")
    if not job_id:
        raise ValueError(f"row {index + 1} is missing id")
    if not description:
        raise ValueError(f"row {index + 1} ({job_id}) is missing description")

    width = int_value(row.get("width", ""), args.width, f"row {index + 1} width")
    height = int_value(row.get("height", ""), args.height, f"row {index + 1} height")
    seed = int_value(row.get("seed", ""), args.seed + index, f"row {index + 1} seed")
    row_allow_text = bool_value(row.get("allow_text", "")) if row.get("allow_text") else False

    return {
        "id": job_id,
        "safe_id": safe_id(job_id),
        "sentence": sentence,
        "description": description,
        "width": width,
        "height": height,
        "seed": seed,
        "allow_text": args.allow_text or row_allow_text,
        "pdf_page": row.get("pdf_page"),
        "source_row": index + 1,
    }


def load_jobs(csv_path: Path, args: argparse.Namespace) -> list[dict[str, Any]]:
    if not csv_path.exists():
        raise SystemExit(f"CSV file does not exist: {csv_path}")

    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise SystemExit(f"CSV file has no header row: {csv_path}")
        rows = list(reader)

    if args.limit is not None:
        rows = rows[: args.limit]
    jobs = [normalize_job(row, args, index) for index, row in enumerate(rows)]
    if not jobs:
        raise SystemExit(f"No jobs to process from {csv_path}")
    return jobs


def load_puzzle_jobs(json_path: Path, args: argparse.Namespace) -> list[dict[str, Any]]:
    if not json_path.exists():
        raise SystemExit(f"Puzzle JSON file does not exist: {json_path}")

    data = json.loads(json_path.read_text(encoding="utf-8"))
    puzzles = data.get("puzzles") if isinstance(data, dict) else None
    if not isinstance(puzzles, list):
        raise SystemExit(f"Puzzle JSON does not contain a puzzles list: {json_path}")

    if args.limit is not None:
        puzzles = puzzles[: args.limit]

    jobs: list[dict[str, Any]] = []
    for index, puzzle in enumerate(puzzles):
        if not isinstance(puzzle, dict):
            raise SystemExit(f"Puzzle entry {index + 1} is not an object in {json_path}")
        jobs.append(
            normalize_job(
                {
                    "puzzle_id": puzzle.get("puzzle_id"),
                    "solution_sentence": puzzle.get("solution_sentence"),
                    "image_description": puzzle.get("image_description"),
                    "pdf_page": puzzle.get("pdf_page"),
                    "allow_text": puzzle.get("allow_text", False),
                },
                args,
                index,
            )
        )

    if not jobs:
        raise SystemExit(f"No puzzle jobs to process from {json_path}")
    return jobs


def build_queue_command(
    args: argparse.Namespace,
    *,
    job: dict[str, Any],
    mode: str,
    output_dir: Path,
    positive_prompt: str,
    negative_prompt: str,
) -> tuple[list[str], str]:
    filename_prefix = f"school-code/{mode}/{job['safe_id']}"
    command = [
        args.python,
        r"scripts\comfyui_queue.py",
        str(args.workflow),
        "--server",
        args.server,
        "--positive-prompt",
        positive_prompt,
        "--width",
        str(job["width"]),
        "--height",
        str(job["height"]),
        "--seed",
        str(job["seed"]),
        "--filename-prefix",
        filename_prefix,
    ]
    if getattr(args, "workflow_has_negative_prompt", True):
        command.extend(["--negative-prompt", negative_prompt])
    if args.dry_run:
        command.append("--dry-run")
    else:
        command.extend(
            [
                "--wait",
                "--timeout",
                str(args.timeout),
                "--download-to",
                str(output_dir),
            ]
        )
        if args.overwrite:
            command.append("--overwrite")
    return command, filename_prefix


def run_job(
    args: argparse.Namespace,
    *,
    job: dict[str, Any],
    mode: str,
    output_dir: Path,
    source_csv: Path | None = None,
    source_json: Path | None = None,
) -> int:
    helper_repo = Path(args.helper_repo)
    if not args.dry_run:
        output_dir.mkdir(parents=True, exist_ok=True)
    allow_text = bool(job["allow_text"])
    positive_prompt = build_positive_prompt(
        style_prompt=args.style_prompt,
        description=job["description"],
        sentence=job["sentence"],
        allow_text=allow_text,
    )
    negative_prompt = negative_prompt_for(args, allow_text=allow_text)
    command, filename_prefix = build_queue_command(
        args,
        job=job,
        mode=mode,
        output_dir=output_dir,
        positive_prompt=positive_prompt,
        negative_prompt=negative_prompt,
    )

    metadata = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "id": job["id"],
        "sentence": job["sentence"],
        "description": job["description"],
        "pdf_page": job.get("pdf_page"),
        "positive_prompt": positive_prompt,
        "negative_prompt": negative_prompt,
        "negative_prompt_applied": bool(getattr(args, "workflow_has_negative_prompt", True)),
        "width": job["width"],
        "height": job["height"],
        "seed": job["seed"],
        "allow_text": allow_text,
        "filename_prefix": filename_prefix,
        "workflow": str(helper_path(helper_repo, args.workflow)),
        "helper_repo": str(helper_repo),
        "server": args.server,
        "source_csv": str(source_csv) if source_csv else None,
        "source_json": str(source_json) if source_json else None,
        "source_row": job.get("source_row"),
        "command": command,
    }

    print()
    print(f"Job {job['id']}:")
    print_command(helper_repo, command)
    try:
        result = subprocess.run(
            command,
            cwd=helper_repo,
            text=True,
            capture_output=True,
        )
    except FileNotFoundError as exc:
        raise QueueFailure(f"Could not run {args.python!r}. Is Python on PATH?") from exc

    if result.stdout.strip():
        print(result.stdout.strip())
    if result.stderr.strip():
        print(result.stderr.strip(), file=sys.stderr)
    if result.returncode != 0:
        raise QueueFailure(
            f"helper script failed for {job['id']} with exit code {result.returncode}",
            returncode=result.returncode,
        )

    parsed = extract_json_object(result.stdout)
    if args.dry_run:
        return 0
    if not parsed:
        raise QueueFailure(f"could not parse helper JSON output for {job['id']}")

    downloaded = parsed.get("downloaded") or []
    if not downloaded:
        raise QueueFailure(f"helper completed but did not report downloaded assets for {job['id']}")

    for item in downloaded:
        image_path = Path(item["path"])
        sidecar = image_path.with_suffix(image_path.suffix + ".prompt.json")
        write_json(
            sidecar,
            {
                **metadata,
                "downloaded_asset": item,
                "prompt_id": parsed.get("prompt_id"),
            },
        )
        print(f"Wrote prompt sidecar: {sidecar}")
    return 0


def command_probe(args: argparse.Namespace) -> int:
    validate_helper_paths(args)
    args.workflow_has_negative_prompt = workflow_supports_negative_prompt(args)
    if not args.workflow_has_negative_prompt:
        print("Workflow has no negative prompt text node; omitting --negative-prompt.")
    if not args.dry_run:
        ensure_comfyui_reachable(args)

    job = {
        "id": args.id,
        "safe_id": safe_id(args.id),
        "sentence": args.sentence,
        "description": args.description,
        "width": args.width,
        "height": args.height,
        "seed": args.seed,
        "allow_text": args.allow_text,
        "source_row": None,
    }
    output_dir = project_path(args.probe_output_dir)
    try:
        return run_job(args, job=job, mode="probes", output_dir=output_dir)
    except QueueFailure as exc:
        print(f"FAILED {job['id']}: {exc}", file=sys.stderr)
        return exc.returncode


def command_bulk(args: argparse.Namespace) -> int:
    validate_helper_paths(args)
    args.workflow_has_negative_prompt = workflow_supports_negative_prompt(args)
    if not args.workflow_has_negative_prompt:
        print("Workflow has no negative prompt text node; omitting --negative-prompt.")
    source_csv = None
    source_json = None
    if args.puzzles_json:
        source_json = project_path(args.puzzles_json)
        jobs = load_puzzle_jobs(source_json, args)
    else:
        source_csv = project_path(args.csv)
        jobs = load_jobs(source_csv, args)
    if not args.dry_run:
        ensure_comfyui_reachable(args)

    output_dir = project_path(args.bulk_output_dir)
    failures: list[dict[str, Any]] = []
    for job in jobs:
        try:
            run_job(
                args,
                job=job,
                mode="bulk",
                output_dir=output_dir,
                source_csv=source_csv,
                source_json=source_json,
            )
        except QueueFailure as exc:
            failures.append({"id": job["id"], "error": str(exc), "returncode": exc.returncode})
            print(f"FAILED {job['id']}: {exc}", file=sys.stderr)

    if failures:
        failure_log = output_dir / "bulk_failures.json"
        write_json(
            failure_log,
            {
                "created_at": datetime.now(timezone.utc).isoformat(),
                "source_csv": str(source_csv) if source_csv else None,
                "source_json": str(source_json) if source_json else None,
                "failures": failures,
            },
        )
        print(f"Wrote failure log: {failure_log}", file=sys.stderr)
        return 1
    return 0


def add_common_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--helper-repo", default=str(DEFAULT_HELPER_REPO))
    parser.add_argument("--workflow", default=str(DEFAULT_WORKFLOW))
    parser.add_argument("--server", default=os.environ.get("COMFYUI_SERVER", DEFAULT_SERVER))
    parser.add_argument("--python", default=os.environ.get("COMFYUI_HELPER_PYTHON", "python"))
    parser.add_argument("--style-prompt", default=DEFAULT_STYLE_PROMPT)
    parser.add_argument("--negative-prompt", default=DEFAULT_NEGATIVE_PROMPT)
    parser.add_argument("--width", type=int, default=1024)
    parser.add_argument("--height", type=int, default=1024)
    parser.add_argument("--seed", type=int, default=12345)
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument(
        "--allow-text",
        action="store_true",
        help="Allow readable text requests in prompts. Off by default.",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    probe = subparsers.add_parser("probe", help="Generate exactly one probe image.")
    add_common_args(probe)
    probe.add_argument("--id", default="apple-test")
    probe.add_argument("--sentence", default="A is for apple")
    probe.add_argument("--description", default="a red apple on a classroom desk")
    probe.add_argument("--probe-output-dir", default=r"generated\images\comfyui\probes")
    probe.set_defaults(func=command_probe)

    bulk = subparsers.add_parser("bulk", help="Generate images from a CSV job list.")
    add_common_args(bulk)
    bulk.add_argument("--csv", default=r"generated\prompts\image_jobs.csv")
    bulk.add_argument(
        "--puzzles-json",
        nargs="?",
        const=str(DEFAULT_PUZZLES_JSON),
        default=None,
        help="Read all jobs directly from sentence puzzles JSON instead of the CSV.",
    )
    bulk.add_argument("--limit", type=int, help="Only process the first N jobs.")
    bulk.add_argument("--bulk-output-dir", default=r"generated\images\comfyui\bulk")
    bulk.set_defaults(func=command_bulk)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    if getattr(args, "limit", None) is not None and args.limit < 1:
        parser.error("--limit must be at least 1")
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
