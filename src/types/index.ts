export type PlayType = "singles" | "doubles" | "mixed";
export type Sport = "badminton" | "pickleball";
export const SPORT_LABELS: Record<Sport, string> = {
  badminton: "Badminton",
  pickleball: "Pickleball",
};
export type ScoringRule =
  | "standard_21"
  | "lenient_31"
  | "pickleball_11_sudden_death"
  | "pickleball_11_deuce";
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
  start_time?: string | null;
  sport?: Sport;
  id: string;
  organizer_id: string;
  name: string;
  description: string | null;
  event_date: string;
  venue: string | null;
  play_type: PlayType;
  court_count: number;
  best_of: 1 | 3;
  scoring_rule?: ScoringRule;
  format: BracketFormat;
  status: EventStatus;
  published: boolean;
  banner_path: string | null;
  champion_entry_id: string | null;
  created_at: string;
  queue_session_id?: string | null;
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
  event_date?: string | null;
  start_time?: string | null;
  session_hours?: number;
  estimated_match_minutes?: number;
  sport?: Sport;
  id: string;
  organizer_id: string;
  name: string;
  play_type: PlayType;
  court_count: number;
  best_of: 1 | 3;
  scoring_rule?: ScoringRule;
  status: "ongoing" | "completed";
  created_at: string;
  published?: boolean;
  mode?: "normal" | "bracket";
  bracket_format?: BracketFormat;
}
export interface QueueTeam {
  id: string;
  session_id: string;
  name: string;
  position: number;
  player_ids: string[];
}
export interface QueueRotation {
  id: string;
  session_id: string;
  player_ids: string[];
  target_matches: number;
  created_at: string;
}
export interface QueueRotationGame {
  id: string;
  session_id: string;
  position: number;
  player_ids: string[];
  match_id: string | null;
}
export interface PublicSessionMatch {
  id: string;
  status: "playing" | "completed";
  court_no: number;
  started_at: string;
  completed_at: string | null;
  winner_side: "a" | "b" | null;
  walkover: boolean;
  side_a: string;
  side_b: string;
  players_a?: string[];
  players_b?: string[];
  games: Game[];
}
export interface PublicSession {
  event_date?: string | null;
  start_time?: string | null;
  sport?: Sport;
  id: string;
  name: string;
  play_type: PlayType;
  court_count: number;
  best_of: 1 | 3;
  scoring_rule?: ScoringRule;
  status: "ongoing" | "completed";
  created_at: string;
  waiting: { name: string; position: number }[];
  matches: PublicSessionMatch[];
  mode?: "normal" | "bracket";
  bracket_format?: BracketFormat;
  teams?: { id: string; name: string; players: string[] }[];
  bracket?: {
    tournament_id: string;
    format: BracketFormat;
    champion_entry_id: string | null;
    entries: Entry[];
    matches: TournamentMatch[];
    games: MatchGame[];
  } | null;
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
  team_a_name?: string | null;
  team_b_name?: string | null;
}
export interface PublicPlayerMatch {
  sport?: Sport;
  id: string;
  event_id: string;
  event_name: string;
  kind: "tournament" | "queue";
  play_type: PlayType;
  completed_at: string;
  court_no: number | null;
  walkover: boolean;
  side_a: string;
  side_b: string;
  players_a: string[];
  players_b: string[];
  result: "win" | "loss";
  games: Game[];
}
export interface PublicPlayer {
  sport?: Sport;
  id: string;
  name: string;
  archived: boolean;
  wins: number;
  losses: number;
  matches: PublicPlayerMatch[];
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
  queueTeams?: QueueTeam[];
  queueRotations?: QueueRotation[];
  queueRotationGames?: QueueRotationGame[];
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
  queueTeams: [],
  queueRotations: [],
  queueRotationGames: [],
};
export const FORMAT_LABELS: Record<BracketFormat, string> = {
  single_elimination: "Single elimination",
  double_elimination: "Double elimination",
  round_robin: "Round robin",
};
