update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = null
where id = 'scratch-projects';

alter table public.board_posts
  drop constraint if exists board_posts_category_check,
  drop constraint if exists board_posts_file_path_check;

alter table public.board_posts
  add column uploader text not null default '스크래치 게임'
    check (char_length(uploader) between 1 and 20),
  add column file_name text not null default 'Scratch project.sb3'
    check (char_length(file_name) between 1 and 180);

alter table public.board_posts
  add constraint board_posts_category_check
    check (category in ('video', 'game', 'song', 'art')),
  add constraint board_posts_file_path_check
    check (file_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.sb3)?$');
