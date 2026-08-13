/**
 * supabase/schema.sql に対応する型定義。
 * 本来は `supabase gen types typescript --linked` で自動生成するのが望ましいが、
 * プロジェクトリンク前の骨組み段階なので手書きの最小版を置いている。
 * schema.sqlを変更したら、可能な限り早くCLI生成に置き換えること。
 *
 * @supabase/supabase-js (postgrest-js) の GenericSchema/GenericTable の形に
 * 合わせて Relationships / Views / Functions / Enums を明示している
 * (省略すると型推論が never に潰れて select()/insert() 等の型が効かなくなる)。
 */
export interface Database {
  public: {
    Tables: {
      golf_courses: {
        Row: {
          golf_course_id: number;
          golf_course_name: string;
          golf_course_abbr: string | null;
          golf_course_kana: string | null;
          address: string | null;
          postal_code: string | null;
          latitude: number | null;
          longitude: number | null;
          highway: string | null;
          ic: string | null;
          ic_distance: string | null;
          course_type: string | null;
          designer: string | null;
          hole_count: number | null;
          par_count: number | null;
          course_distance: string | null;
          dimension: string | null;
          evaluation: number | null;
          rating_num: number | null;
          image_urls: string[];
          raw_detail_json: Record<string, unknown> | null;
          fetched_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["golf_courses"]["Row"]> & {
          golf_course_id: number;
          golf_course_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["golf_courses"]["Row"]>;
        Relationships: [];
      };
      course_search_index: {
        Row: {
          grid_key: string;
          search_radius: number;
          course_ids: number[];
          api_count: number | null;
          api_hits: number | null;
          api_page: number | null;
          api_page_count: number | null;
          raw_search_json: unknown;
          fetched_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["course_search_index"]["Row"]> & {
          grid_key: string;
          search_radius: number;
          course_ids: number[];
        };
        Update: Partial<Database["public"]["Tables"]["course_search_index"]["Row"]>;
        Relationships: [];
      };
      golf_plans_daily: {
        Row: {
          golf_course_id: number;
          play_date: string;
          plans: unknown[];
          stock_status: number | null;
          stock_count: number | null;
          reserve_url_pc_base: string | null;
          fetched_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["golf_plans_daily"]["Row"]> & {
          golf_course_id: number;
          play_date: string;
        };
        Update: Partial<Database["public"]["Tables"]["golf_plans_daily"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
