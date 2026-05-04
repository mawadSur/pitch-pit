export type FeedIdea = {
  id: string;
  title: string;
  pitch: string;
  handle: string | null;
  score: number;
  final_score: number | null;
  vote_count: number;
  verdict: string;
  build_recommended: boolean;
  status: string;
  created_at: string;
};

export type LeaderboardIdea = {
  id: string;
  title: string;
  handle: string | null;
  score: number;
  final_score: number | null;
  vote_count: number;
  verdict: string;
  build_recommended: boolean;
  created_at: string;
};

export const FEED_SELECT =
  "id,title,pitch,handle,score,final_score,vote_count,verdict,build_recommended,status,created_at";

export const LEADERBOARD_SELECT =
  "id,title,handle,score,final_score,vote_count,verdict,build_recommended,created_at";

export const VISIBLE_STATUSES = [
  "scored",
  "queued",
  "building",
  "built",
] as const;
