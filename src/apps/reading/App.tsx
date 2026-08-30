import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { getPreferredSpellingVoice } from "../../utils/speechPreferences";
import { getReadingFamily, READING_FAMILIES } from "./readingWords";
import "./reading.css";

function FamilyChooser() {
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
            <Link key={family.id} to={`/reading/${family.id}`} className="reading-family">
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
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const current = family.words[index];

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
      if (event.key === "Escape" || event.key === "ArrowDown") navigate("/reading");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.speechSynthesis?.cancel();
    };
  }, [move, navigate, toggle]);

  return (
    <main
      className="reading-deck"
      onTouchStart={(event) => { touchStartY.current = event.touches[0]?.clientY ?? null; }}
      onTouchEnd={(event) => {
        const start = touchStartY.current;
        const end = event.changedTouches[0]?.clientY;
        touchStartY.current = null;
        if (start !== null && end !== undefined && end - start > 90) navigate("/reading");
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
