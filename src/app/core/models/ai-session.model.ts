import { AiMode, AiMessage } from '../services/ai.service';

export interface AiSession {
  projectId: string;
  mode:      AiMode;
  messages:  AiMessage[];
  updatedAt: string; // ISO
}
