// Read-only application contract, maintained from these migrations.
// Regenerate/compare schema types with `supabase gen types --local` after full local validation.
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json | undefined };

export type Participant = {
  id: string;
  name: string;
  slug: string;
  photo_path: string | null;
  photo_url: string | null;
  avatar_key: string;
  personal_message: string | null;
  general_preferences: string | null;
  display_order: number;
  version: number;
  created_at: string;
  updated_at: string;
};

export type Gift = {
  id: string;
  participant_id: string;
  position: number;
  title: string;
  description: string | null;
  image_path: string | null;
  image_url: string | null;
  product_url: string | null;
  reference_price: number | null;
  currency: string | null;
  gift_type: 'clothing' | 'object';
  details: Json;
  version: number;
  created_at: string;
  updated_at: string;
};

export type EventSettings = {
  id: number;
  title: string;
  welcome_message: string;
  exchange_date: string | null;
  default_currency: string;
  suggested_budget: number | null;
  version: number;
  created_at: string;
  updated_at: string;
};

type ReadOnlyTable<Row, Relationships extends { foreignKeyName: string; columns: string[]; referencedRelation: string; referencedColumns: string[] }[] = []> = {
  Row: Row; Insert: never; Update: never; Relationships: Relationships;
};

export interface Database {
  public: {
    Tables: {
      participants: ReadOnlyTable<Participant>;
      gifts: ReadOnlyTable<Gift, [{
        foreignKeyName: 'gifts_participant_id_fkey'; columns: ['participant_id'];
        referencedRelation: 'participants'; referencedColumns: ['id'];
      }]>;
      event_settings: ReadOnlyTable<EventSettings>;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
