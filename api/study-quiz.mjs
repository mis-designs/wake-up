export const STUDY_CHAPTER_COUNT = 25;

export function normalizeStudyChapter(value) {
  const source = String(value ?? "").trim();
  if (!/^\d{1,2}$/.test(source)) return null;
  const chapter = Number(source);
  return Number.isInteger(chapter) && chapter >= 1 && chapter <= STUDY_CHAPTER_COUNT
    ? chapter
    : null;
}

function questionOrder(row, fallback) {
  const matches = String(row?.id ?? "").match(/\d+/g) || [];
  const digits = matches[matches.length - 1];
  const number = Number(digits);
  return Number.isFinite(number) ? number : Number.MAX_SAFE_INTEGER + fallback;
}

export function selectStudyChapterRows(rows, requestedChapter) {
  const chapter = normalizeStudyChapter(requestedChapter);
  if (!chapter || !Array.isArray(rows)) return [];

  const chapterKey = String(chapter);
  const chapterIdPattern = new RegExp(`^cap(?:itolo)?[_-]?0*${chapterKey}(?:[_-]|$)`, "i");

  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) =>
      String(Number(String(row?.chapter ?? "").trim())) === chapterKey
      || chapterIdPattern.test(String(row?.id ?? "").trim())
    )
    .sort((left, right) =>
      questionOrder(left.row, left.index) - questionOrder(right.row, right.index)
      || left.index - right.index
    )
    .map(({ row }) => ({
      ...row,
      audioQuestion: row.question,
      audioFigure: row.figure
    }));
}
