export type PlayType = "singles" | "doubles";
export type BracketFormat =
  "single_elimination" | "double_elimination" | "round_robin";
export type EventStatus = "draft" | "ongoing" | "completed";
export type MatchStatus =
  "pending" | "ready" | "playing" | "completed" | "bye" | "skipped";
export type BracketLane = "upper" | "lower" | "final" | "reset" | "round_robin";
export interface Player {
  id: string;
  organizer_id: string;
  name: string;
  photo_path: string | null;
  archived: boolean;
  created_at: string;
}
export interface Tournament {
  id: string;
  organizer_id: string;
  name: string;
  description: string | null;
  event_date: string;
  venue: string | null;
  play_type: PlayType;
  court_count: number;
  best_of: 1 | 3;
  format: BracketFormat;
  status: EventStatus;
  published: boolean;
  banner_path: string | null;
  champion_entry_id: string | null;
  created_at: string;
}
export interface Entry {
  id: string;
  tournament_id: string;
  name: string;
  seed: number;
  player_ids: string[];
}
export interface Game {
  game_no: number;
  score_a: number;
  score_b: number;
}
export interface TournamentMatch {
  id: string;
  tournament_id: string;
  bracket: BracketLane;
  round_no: number;
  position: number;
  entry_a_id: string | null;
  entry_b_id: string | null;
  source_a_match_id: string | null;
  source_a_outcome: "winner" | "loser" | null;
  source_b_match_id: string | null;
  source_b_outcome: "winner" | "loser" | null;
  winner_entry_id: string | null;
  loser_entry_id: string | null;
  status: MatchStatus;
  court_no: number | null;
  started_at: string | null;
  completed_at: string | null;
  walkover: boolean;
  version: number;
}
export interface QueueSession {
  id: string;
  organizer_id: string;
  name: string;
  play_type: PlayType;
  court_count: number;
  best_of: 1 | 3;
  status: "ongoing" | "completed";
  created_at: string;
}
export interface QueueMember {
  id: string;
  session_id: string;
  player_id: string;
  position: number;
  status: "waiting" | "playing";
  rejoin: boolean;
}
export interface QueueMatch {
  id: string;
  session_id: string;
  status: "playing" | "completed";
  court_no: number;
  winner_side: "a" | "b" | null;
  started_at: string;
  completed_at: string | null;
  walkover: boolean;
  version: number;
}
export interface QueueMatchPlayer {
  match_id: string;
  player_id: string;
  side: "a" | "b";
}
export interface MatchGame extends Game {
  id: string;
  tournament_match_id: string | null;
  queue_match_id: string | null;
}
export interface AppData {
  players: Player[];
  tournaments: Tournament[];
  entries: Entry[];
  tournamentMatches: TournamentMatch[];
  queueSessions: QueueSession[];
  queueMembers: QueueMember[];
  queueMatches: QueueMatch[];
  queueMatchPlayers: QueueMatchPlayer[];
  games: MatchGame[];
}
export const EMPTY_DATA: AppData = {
  players: [],
  tournaments: [],
  entries: [],
  tournamentMatches: [],
  queueSessions: [],
  queueMembers: [],
  queueMatches: [],
  queueMatchPlayers: [],
  games: [],
};
export const FORMAT_LABELS: Record<BracketFormat, string> = {
  single_elimination: "Single elimination",
  double_elimination: "Double elimination",
  round_robin: "Round robin",
};
