export type NotificationType =
  | 'territory_captured'
  | 'territory_lost'
  | 'territory_expired';

export interface NotificationEvent {
  id: string;
  user_id: string;
  type: NotificationType;
  source_module: 'run_module';
  occurred_at: string;
  payload: Record<string, unknown>;
}
