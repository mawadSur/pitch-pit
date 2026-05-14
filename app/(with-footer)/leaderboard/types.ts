export type WeekSummary = {
  id: string;
  weekNumber: number;
  status: "open" | "closed" | "built";
  startAt: string;
  endAt: string;
  winnerIdeaId: string | null;
};
