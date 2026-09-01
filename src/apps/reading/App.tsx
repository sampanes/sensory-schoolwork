import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { getPreferredSpellingVoice } from "../../utils/speechPreferences";
import { getReadingFamily, READING_FAMILIES } from "./readingWords";
import "./reading.css";

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
  unlock?: () => void;
};

async function prepareReadingDeck() {
  if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen is an enhancement. Orientation may still be lockable.
    }
  }

  try {
    await (screen.orientation as LockableOrientation).lock?.("landscape");
  } catch {
    // Android browsers differ here; never prevent a child entering the deck.
  }
}

function FamilyChooser() {
  const navigate = useNavigate();

  const chooseFamily = (event: React.MouseEvent<HTMLAnchorElement>, familyId: string) => {
    event.preventDefault();
    void prepareReadingDeck().finally(() => {
      navigate(`/reading/${familyId}`, { state: { fromReadingChooser: true } });
    });
  };

  return (
    <main className="reading-chooser">
      <div className="reading-chooser__panel">
        <Link className="reading-chooser__back" to="/" aria-label="Back to activities">
          ← Activities
        </Link>
        <h1>Sound It Out</h1>
        <p>Choose a word family.</p>
        <div className="reading-family-grid">
          {READING_FAMILIES.map((family) => (
            <Link
              key={family.id}
              to={`/reading/${family.id}`}
              className="reading-family"
              onClick={(event) => chooseFamily(event, family.id)}
            >
              {family.label}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

function speakWord(word: string) {
  try {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = 0.8;
    utterance.pitch = 1.05;
    const voice = getPreferredSpellingVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    window.speechSynthesis.speak(utterance);
  } catch {
    // Speech is an enhancement; decoding and navigation must remain available.
  }
}

function ReadingDeck({ familyId }: { familyId: string }) {
  const family = getReadingFamily(familyId)!;
  const navigate = useNavigate();
  const location = useLocation();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const current = family.words[index];

  const leaveDeck = useCallback(() => {
    if ((location.state as { fromReadingChooser?: boolean } | null)?.fromReadingChooser) {
      navigate(-1);
    } else {
      navigate("/reading", { replace: true });
    }
  }, [location.state, navigate]);

  const move = useCallback((amount: number) => {
    setIndex((value) => (value + amount + family.words.length) % family.words.length);
    setRevealed(false);
    setImageFailed(false);
    window.speechSynthesis?.cancel();
  }, [family.words.length]);

  const toggle = useCallback(() => {
    setRevealed((value) => {
      if (!value) speakWord(current.word);
      return !value;
    });
  }, [current.word]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        toggle();
      }
      if (event.key === "Escape" || event.key === "ArrowDown") leaveDeck();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [leaveDeck, move, toggle]);

  useEffect(() => {
    const preventNativeTouch = (event: TouchEvent) => event.preventDefault();
    document.documentElement.classList.add("reading-deck-active");
    document.body.classList.add("reading-deck-active");
    document.addEventListener("touchmove", preventNativeTouch, { passive: false });

    return () => {
      document.removeEventListener("touchmove", preventNativeTouch);
      document.documentElement.classList.remove("reading-deck-active");
      document.body.classList.remove("reading-deck-active");
      window.speechSynthesis?.cancel();
      try {
        (screen.orientation as LockableOrientation).unlock?.();
      } catch {
        // Best-effort cleanup for browsers with partial orientation support.
      }
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    };
  }, []);

  return (
    <main
      className="reading-deck"
      onTouchStart={(event) => { touchStartY.current = event.touches[0]?.clientY ?? null; }}
      onTouchEnd={(event) => {
        const start = touchStartY.current;
        const end = event.changedTouches[0]?.clientY;
        touchStartY.current = null;
        if (start !== null && end !== undefined && end - start > 90) leaveDeck();
      }}
    >
      <div className={`reading-card ${revealed ? "reading-card--revealed" : ""}`} aria-live="polite">
        {revealed && current.image && !imageFailed ? (
          <img
            src={current.image}
            alt=""
            draggable={false}
            onError={() => setImageFailed(true)}
          />
        ) : null}
        <div className="reading-word">{current.word}</div>
      </div>
      <button className="reading-zone reading-zone--previous" onClick={() => move(-1)} aria-label="Previous word" />
      <button className="reading-zone reading-zone--reveal" onClick={toggle} aria-label={revealed ? "Hide answer" : "Reveal answer"} />
      <button className="reading-zone reading-zone--next" onClick={() => move(1)} aria-label="Next word" />
    </main>
  );
}

export default function ReadingApp() {
  const { familyId } = useParams();
  if (!familyId) return <FamilyChooser />;
  if (!getReadingFamily(familyId)) return <Navigate to="/reading" replace />;
  return <ReadingDeck key={familyId} familyId={familyId} />;
}
