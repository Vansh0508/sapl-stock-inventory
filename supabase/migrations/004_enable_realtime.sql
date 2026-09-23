-- Publish the Manage dictionary tables to the realtime stream so the UI can
-- live-update on insert/update/delete without a browser refresh. The
-- supabase_realtime publication ships empty by default.

alter publication supabase_realtime add table
  public.currencies,
  public.locations,
  public.colors,
  public.qualities,
  public.designs,
  public.collections,
  public.fiber_list,
  public.constructions,
  public.lengths,
  public.widths,
  public.sizes;
