export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      catalog: {
        Row: {
          id: string
          sku: string
          product_code: string
          quality_code: string
          design_code: string
          product_type_id: string
          size_id: string
          quality_id: string
          design_id: string
          collection_id: string | null
          construction_id: string | null
          is_active: boolean
          is_verified?: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          sku?: string
          product_code?: string
          quality_code?: string
          design_code?: string
          product_type_id: string
          size_id: string
          quality_id: string
          design_id: string
          collection_id?: string | null
          construction_id?: string | null
          is_active?: boolean
          is_verified?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          sku?: string
          product_code?: string
          quality_code?: string
          design_code?: string
          product_type_id?: string
          size_id?: string
          quality_id?: string
          design_id?: string
          collection_id?: string | null
          construction_id?: string | null
          is_active?: boolean
          is_verified?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_construction_id_fkey"
            columns: ["construction_id"]
            isOneToOne: false
            referencedRelation: "constructions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_product_type_id_fkey"
            columns: ["product_type_id"]
            isOneToOne: false
            referencedRelation: "product_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "qualities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_size_id_fkey"
            columns: ["size_id"]
            isOneToOne: false
            referencedRelation: "sizes"
            referencedColumns: ["id"]
          }
        ]
      }
      catalog_colors: {
        Row: {
          catalog_id: string
          color_id: string
        }
        Insert: {
          catalog_id: string
          color_id: string
        }
        Update: {
          catalog_id?: string
          color_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_colors_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_colors_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "colors"
            referencedColumns: ["id"]
          }
        ]
      }
      catalog_fibers: {
        Row: {
          catalog_id: string
          fiber_id: string
          percentage: number
        }
        Insert: {
          catalog_id: string
          fiber_id: string
          percentage: number
        }
        Update: {
          catalog_id?: string
          fiber_id?: string
          percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_fibers_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_fibers_fiber_id_fkey"
            columns: ["fiber_id"]
            isOneToOne: false
            referencedRelation: "fiber_list"
            referencedColumns: ["id"]
          }
        ]
      }
      collections: {
        Row: {
          id: string
          collection_name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          collection_name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          collection_name?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      colors: {
        Row: {
          id: string
          color_name: string
          color_code: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          color_name: string
          color_code: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          color_name?: string
          color_code?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      constructions: {
        Row: {
          id: string
          construction_name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          construction_name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          construction_name?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      currencies: {
        Row: {
          id: string
          currency_code: string
          currency_name: string
          symbol: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          currency_code: string
          currency_name: string
          symbol: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          currency_code?: string
          currency_name?: string
          symbol?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      designs: {
        Row: {
          id: string
          design_name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          design_name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          design_name?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      design_codes: {
        Row: {
          id: string
          design_id: string
          design_code: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          design_id: string
          design_code: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          design_id?: string
          design_code?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_codes_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          }
        ]
      }
      fiber_list: {
        Row: {
          id: string
          fiber_name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          fiber_name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          fiber_name?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          id: string
          serial_number: string
          catalog_id: string | null
          location_id: string | null
          product_type_id: string | null
          size_id: string | null
          quality_id: string | null
          design_id: string | null
          collection_id: string | null
          construction_id: string | null
          quality_code: string | null
          design_code: string | null
          product_code: string | null
          sku: string | null
          is_verified?: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          serial_number: string
          catalog_id?: string | null
          location_id?: string | null
          product_type_id?: string | null
          size_id?: string | null
          quality_id?: string | null
          design_id?: string | null
          collection_id?: string | null
          construction_id?: string | null
          quality_code?: string | null
          design_code?: string | null
          product_code?: string | null
          sku?: string | null
          is_verified?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          serial_number?: string
          catalog_id?: string | null
          location_id?: string | null
          product_type_id?: string | null
          size_id?: string | null
          quality_id?: string | null
          design_id?: string | null
          collection_id?: string | null
          construction_id?: string | null
          quality_code?: string | null
          design_code?: string | null
          product_code?: string | null
          sku?: string | null
          is_verified?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_product_type_id_fkey"
            columns: ["product_type_id"]
            isOneToOne: false
            referencedRelation: "product_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_size_id_fkey"
            columns: ["size_id"]
            isOneToOne: false
            referencedRelation: "sizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "qualities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_construction_id_fkey"
            columns: ["construction_id"]
            isOneToOne: false
            referencedRelation: "constructions"
            referencedColumns: ["id"]
          }
        ]
      }
      inventory_images: {
        Row: {
          id: string
          inventory_id: string | null
          storage_path: string
          public_url: string
          is_primary: boolean
          display_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          inventory_id?: string | null
          storage_path: string
          public_url: string
          is_primary?: boolean
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          inventory_id?: string | null
          storage_path?: string
          public_url?: string
          is_primary?: boolean
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_images_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          }
        ]
      }
      lengths: {
        Row: {
          id: string
          length_name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          length_name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          length_name?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          id: string
          location_name: string
          state: string | null
          country: string
          currency_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          location_name: string
          state?: string | null
          country: string
          currency_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          location_name?: string
          state?: string | null
          country?: string
          currency_id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          }
        ]
      }
      prices: {
        Row: {
          id: string
          catalog_id: string
          location_id: string
          amount: number
          effective_date: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          catalog_id: string
          location_id: string
          amount: number
          effective_date?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          catalog_id?: string
          location_id?: string
          amount?: number
          effective_date?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prices_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          }
        ]
      }
      product_types: {
        Row: {
          id: string
          product_name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          product_name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          product_name?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      qualities: {
        Row: {
          id: string
          quality_name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          quality_name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          quality_name?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      quality_codes: {
        Row: {
          id: string
          quality_id: string
          quality_code: string
          quality_prefix: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          quality_id: string
          quality_code: string
          quality_prefix?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          quality_id?: string
          quality_code?: string
          quality_prefix?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quality_codes_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "qualities"
            referencedColumns: ["id"]
          }
        ]
      }
      sizes: {
        Row: {
          id: string
          width_id: string
          length_id: string
          size_label: string
          so_seq: number
          so_number: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          width_id: string
          length_id: string
          size_label: string
          so_seq?: number
          so_number?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          width_id?: string
          length_id?: string
          size_label?: string
          so_seq?: number
          so_number?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sizes_length_id_fkey"
            columns: ["length_id"]
            isOneToOne: false
            referencedRelation: "lengths"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sizes_width_id_fkey"
            columns: ["width_id"]
            isOneToOne: false
            referencedRelation: "widths"
            referencedColumns: ["id"]
          }
        ]
      }
      widths: {
        Row: {
          id: string
          width_name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          width_name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          width_name?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      view_active_prices: {
        Row: {
          catalog_id: string
          location_id: string
          location_name: string
          currency_code: string
          symbol: string
          amount: number
          effective_date: string
        }
      }
      view_catalog_full: {
        Row: {
          id: string
          sku: string
          product_code: string
          quality_code: string
          design_code: string
          is_active: boolean
          is_verified?: boolean
          product_name: string
          size_label: string
          so_number: string
          quality_name: string
          quality_prefix: string | null
          design_name: string
          collection_name: string | null
          construction_name: string | null
          color_names: string | null
          color_codes: string | null
          fiber_configuration: string | null
          created_at: string
          updated_at: string
        }
      }
      view_inventory_full: {
        Row: {
          id: string
          serial_number: string
          sku: string | null
          catalog_id: string | null
          location_id: string | null
          location_name: string | null
          product_name: string | null
          size_label: string | null
          so_number: string | null
          quality_name: string | null
          design_name: string | null
          collection_name: string | null
          construction_name: string | null
          color_names: string | null
          color_codes: string | null
          primary_image_url: string | null
          created_at: string
          updated_at: string
        }
      }
      view_inventory_gallery: {
        Row: {
          id: string
          serial_number: string
          sku: string | null
          catalog_id: string | null
          location_id: string | null
          location_name: string | null
          product_name: string | null
          size_label: string | null
          so_number: string | null
          quality_name: string | null
          design_name: string | null
          collection_name: string | null
          construction_name: string | null
          color_names: string | null
          color_codes: string | null
          fiber_configuration: string | null
          primary_image_url: string | null
          image_urls: string[] | null
          image_count: number
          active_price: number | null
          currency_code: string | null
          currency_symbol: string | null
          created_at: string
          updated_at: string
        }
      }
      view_sizes_full: {
        Row: {
          id: string
          width_id: string
          length_id: string
          size_label: string
          so_seq: number
          so_number: string | null
          width_name: string | null
          length_name: string | null
          created_at: string
          updated_at: string
        }
      }
    }
    Functions: {
      copy_catalog_to_inventory: {
        Args: {
          p_inventory_ids?: string[] | null
        }
        Returns: number
      }
    }
    Enums: {}
    CompositeTypes: {}
  }
}
