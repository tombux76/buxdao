import styles from "./HeroTitle.module.css";

type HeroTitleProps = {
  title: string;
  subtitle: string;
};

type WordSegment = {
  word: string;
  startIndex: number;
};

function buildWordSegments(title: string): WordSegment[] {
  let startIndex = 0;
  return title.split(" ").map((word) => {
    const segment = { word, startIndex };
    startIndex += word.length + 1;
    return segment;
  });
}

function HeroLetter({ char, index }: { char: string; index: number }) {
  return (
    <span
      className={styles.letter}
      style={{ animationDelay: `${index * 0.08}s` }}
    >
      {char}
    </span>
  );
}

export function HeroTitle({ title, subtitle }: HeroTitleProps) {
  const segments = buildWordSegments(title);

  return (
    <div className={styles.block}>
      <h1 className={styles.title} aria-label={title}>
        {segments.map(({ word, startIndex }, wi) => (
          <span key={`${wi}-${word}`} className={styles.word}>
            {word.split("").map((char, i) => (
              <HeroLetter
                key={`${startIndex + i}-${char}`}
                char={char}
                index={startIndex + i}
              />
            ))}
          </span>
        ))}
      </h1>
      <p className={styles.subtitle}>{subtitle}</p>
    </div>
  );
}
