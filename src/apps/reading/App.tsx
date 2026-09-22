import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  getPreferredSpellingVoice,
  getStoredReadingWordLength,
  setStoredReadingWordLength,
} from "../../utils/speechPreferences";
import {
  ADVANCED_READING_DECK,
  getReadingFamilies,
  getReadingDeck,
  READING_WORD_LENGTHS,
  type ReadingWord,
  type WordLength,
} from "./readingWords";
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
  /*
   * Persisted rather than plain state: leaving a deck remounts this component,
   * so without it a child working through the four-letter families would be
   * dropped back on the three-letter grid after every word.
   */
  const [wordLength, setWordLength] = useState<WordLength>(getStoredReadingWordLength);

  const chooseLength = (length: WordLength) => {
    setWordLength(length);
    setStoredReadingWordLength(length);
  };

  const chooseDeck = (event: React.MouseEvent<HTMLAnchorElement>, deckId: string) => {
    event.preventDefault();
    void prepareReadingDeck().finally(() => {
      navigate(`/reading/${deckId}`, { state: { fromReadingChooser: true } });
    });
  };

  return (
    <main className="reading-chooser">
      <div className="reading-chooser__panel">
        <Link className="reading-chooser__back" to="/" aria-label="Back to activities">
          &lt;- Activities
        </Link>
        <h1>Sound It Out</h1>
        <p>Choose a word family.</p>
        <div className="reading-length" role="group" aria-label="Word length">
          {READING_WORD_LENGTHS.map((length) => (
            <button
              key={length}
              type="button"
              className={`reading-length__option ${
                length === wordLength ? "reading-length__option--active" : ""
              }`}
              aria-pressed={length === wordLength}
              onClick={() => chooseLength(length)}
            >
              {length} Letters
            </button>
          ))}
        </div>
        <div className="reading-family-grid">
          {getReadingFamilies(wordLength).map((family) => (
            <Link
              key={family.id}
              to={`/reading/${family.id}`}
              className="reading-family"
              onClick={(event) => chooseDeck(event, family.id)}
            >
              {family.label}
            </Link>
          ))}
        </div>
        <section className="reading-challenge" aria-labelledby="reading-challenge-title">
          <div className="reading-challenge__copy">
            <h2 id="reading-challenge-title">Very advanced</h2>
            <p>Comically difficult words.</p>
          </div>
          <Link
            to={`/reading/${ADVANCED_READING_DECK.id}`}
            className="reading-challenge__link"
            onClick={(event) => chooseDeck(event, ADVANCED_READING_DECK.id)}
            aria-label="Open the Very advanced deck"
          >
            Bring it on -&gt;
          </Link>
        </section>
        {/* Only the sha is shown; the full stamp stays in the title and in the
            bundle, so the deploy check still works without the date taking up
            three quarters of the label. */}
        <p className="reading-chooser__version" title={__BUILD_STAMP__}>
          {__BUILD_STAMP__.split(" ")[0]}
        </p>
      </div>
    </main>
  );
}

function speakWord(entry: ReadingWord) {
  try {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(entry.speechText ?? entry.word);
    utterance.lang = entry.speechLanguage ?? "en-US";
    utterance.rate = entry.speechRate ?? 0.8;
    utterance.pitch = 1.05;

    const requestedLanguage = entry.speechLanguage?.toLowerCase();
    const requestedLanguageRoot = requestedLanguage?.split("-")[0];
    const availableVoices = window.speechSynthesis.getVoices();
    const languageVoice = requestedLanguage
      ? availableVoices.find((voice) => voice.lang.toLowerCase() === requestedLanguage) ??
        availableVoices.find(
          (voice) => voice.lang.toLowerCase().split("-")[0] === requestedLanguageRoot,
        )
      : null;
    const voice = requestedLanguage ? languageVoice : getPreferredSpellingVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    window.speechSynthesis.speak(utterance);
  } catch {
    // Speech is an enhancement; decoding and navigation must remain available.
  }
}

function ReadingDeck({ deckId }: { deckId: string }) {
  const deck = getReadingDeck(deckId)!;
  const navigate = useNavigate();
  const location = useLocation();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const current = deck.words[index];
  const hasRevealedImage = Boolean(revealed && current.image && !imageFailed);
  const isAdvancedDeck = deck.id === ADVANCED_READING_DECK.id;
  const wordClassName = [
    "reading-word",
    isAdvancedDeck ? "reading-word--advanced" : "",
    current.word.length > 8 ? "reading-word--long" : "",
    current.word.length > 16 ? "reading-word--extra-long" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const leaveDeck = useCallback(() => {
    if ((location.state as { fromReadingChooser?: boolean } | null)?.fromReadingChooser) {
      navigate(-1);
    } else {
      navigate("/reading", { replace: true });
    }
  }, [location.state, navigate]);

  const move = useCallback((amount: number) => {
    setIndex((value) => (value + amount + deck.words.length) % deck.words.length);
    setRevealed(false);
    setImageFailed(false);
    window.speechSynthesis?.cancel();
  }, [deck.words.length]);

  const toggle = useCallback(() => {
    setRevealed((value) => {
      if (!value) speakWord(current);
      return !value;
    });
  }, [current]);

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
      <div
        className={`reading-card ${hasRevealedImage ? "reading-card--revealed" : ""}`}
        aria-live="polite"
      >
        {revealed && current.image && !imageFailed ? (
          <img
            src={current.image}
            alt=""
            draggable={false}
            onError={() => setImageFailed(true)}
          />
        ) : null}
        <div className={wordClassName} lang={current.speechLanguage}>
          {current.word}
        </div>
      </div>
      <button className="reading-zone reading-zone--previous" onClick={() => move(-1)} aria-label="Previous word" />
      <button
        className="reading-zone reading-zone--reveal"
        onClick={toggle}
        aria-label={revealed ? "Hide answer" : "Reveal answer"}
        aria-pressed={revealed}
      />
      <button className="reading-zone reading-zone--next" onClick={() => move(1)} aria-label="Next word" />
    </main>
  );
}

export default function ReadingApp() {
  const { familyId: deckId } = useParams();
  if (!deckId) return <FamilyChooser />;
  if (!getReadingDeck(deckId)) return <Navigate to="/reading" replace />;
  return <ReadingDeck key={deckId} deckId={deckId} />;
}
