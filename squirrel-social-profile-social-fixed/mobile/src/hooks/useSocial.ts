/**
 * Data hooks for Profile + Social. Built on the existing `useRemote` (single resources) plus a
 * small cursor pager for feeds and lists. All requests go through `api()` (same token, timeout,
 * retry and ApiError handling as the rest of the app).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { SOCIAL_API_CONFIGURED } from '@/api/config';
import {
  commentsApi,
  feedApi,
  followApi,
  postsApi,
  profileApi,
  socialErrorText,
  type Comment,
  type FeedKind,
  type Follower,
  type Page,
  type Post,
  type Profile,
  type PublicProfile,
} from '@/api/social';
import { useRemote } from '@/api/useRemote';
import {
  acceptServerFollow,
  acceptServerPosts,
  applyPost,
  followStateOf,
  isDeleted,
  pagedCache,
  setFollow,
  useSocialVersion,
  type FollowState,
} from '@/state/socialStore';

/** Social needs a signed-in (live) session and a configured Social service. Demo mode has no social data. */
export function useSocialEnabled() {
  const { mode } = useAuth();
  return mode === 'live' && SOCIAL_API_CONFIGURED;
}

// ---------------------------------------------------------------------------
// Single resources
// ---------------------------------------------------------------------------

export function useMyProfile() {
  const enabled = useSocialEnabled();
  const r = useRemote<Profile>(enabled ? 'social:me' : null, async () => {
    const p = await profileApi.me();
    acceptServerPosts(p.recent_posts);
    return p;
  });
  return { ...r, enabled };
}

export function usePublicProfile(userId: string | undefined) {
  const enabled = useSocialEnabled();
  const r = useRemote<PublicProfile>(enabled && userId ? `social:profile:${userId}` : null, async () => {
    const p = await profileApi.get(userId as string);
    acceptServerPosts(p.recent_posts);
    acceptServerFollow(p.user.id);
    return p;
  });
  return { ...r, enabled };
}

export function usePost(postId: string | undefined) {
  const enabled = useSocialEnabled();
  useSocialVersion();
  const r = useRemote<Post>(enabled && postId ? `social:post:${postId}` : null, async () => {
    const p = await postsApi.get(postId as string);
    acceptServerPosts([p]);
    return p;
  });
  const deleted = !!postId && isDeleted(postId);
  return { ...r, data: r.data && !deleted ? applyPost(r.data) : undefined, deleted, enabled };
}

// ---------------------------------------------------------------------------
// Cursor pages
// ---------------------------------------------------------------------------

type PagedState<T> = {
  key: string | null;
  items: T[];
  cursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  error: unknown;
};

/**
 * Infinite list over a keyset cursor. First pages are cached per key so returning to a screen
 * is instant while it revalidates. `key = null` skips fetching.
 */
export function usePaged<T extends { id: string }>(key: string | null, fetchPage: (cursor: string | null) => Promise<Page<T>>, onPage?: (items: T[]) => void) {
  const cached = key ? (pagedCache.get(key) as Page<T> | undefined) : undefined;
  const [state, setState] = useState<PagedState<T>>({
    key,
    items: cached?.items ?? [],
    cursor: cached?.next_cursor ?? null,
    loading: !!key && !cached,
    loadingMore: false,
    refreshing: false,
    error: null,
  });
  const fetchRef = useRef(fetchPage);
  const onPageRef = useRef(onPage);
  useEffect(() => {
    fetchRef.current = fetchPage;
    onPageRef.current = onPage;
  });
  const req = useRef(0);

  const load = useCallback(
    async (mode: 'first' | 'refresh' | 'more', cursor: string | null) => {
      if (!key) return;
      const id = ++req.current;
      setState((s) => ({ ...s, key, error: null, loading: mode === 'first' && s.items.length === 0, refreshing: mode === 'refresh', loadingMore: mode === 'more' }));
      try {
        const page = await fetchRef.current(mode === 'more' ? cursor : null);
        if (id !== req.current) return;
        onPageRef.current?.(page.items);
        if (mode !== 'more') pagedCache.set(key, page);
        setState((s) => {
          const base = mode === 'more' ? s.items : [];
          const seen = new Set(base.map((x) => x.id));
          return { ...s, items: [...base, ...page.items.filter((x) => !seen.has(x.id))], cursor: page.next_cursor, loading: false, loadingMore: false, refreshing: false };
        });
      } catch (e) {
        if (id !== req.current) return;
        setState((s) => ({ ...s, error: e, loading: false, loadingMore: false, refreshing: false }));
      }
    },
    [key],
  );

  // Key change (feed switch, city switch, sign-in): start over from the cache or a fresh fetch.
  useEffect(() => {
    const c = key ? (pagedCache.get(key) as Page<T> | undefined) : undefined;
    setState({ key, items: c?.items ?? [], cursor: c?.next_cursor ?? null, loading: !!key && !c, loadingMore: false, refreshing: false, error: null });
    if (key) load('first', null);
    else req.current++;
  }, [key, load]);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });
  const loadMore = useCallback(() => {
    const s = stateRef.current;
    if (s.key === key && s.cursor && !s.loadingMore && !s.loading && !s.refreshing && !s.error) load('more', s.cursor);
  }, [key, load]);
  const refresh = useCallback(() => load('refresh', null), [load]);
  const retry = useCallback(() => {
    const s = stateRef.current;
    load(s.items.length ? 'more' : 'first', s.cursor);
  }, [load]);

  const stale = state.key !== key;
  return {
    items: stale ? [] : state.items,
    hasMore: !stale && state.cursor != null,
    loading: stale ? !!key : state.loading,
    loadingMore: state.loadingMore,
    refreshing: state.refreshing,
    error: stale ? null : state.error,
    errorText: state.error && !stale ? socialErrorText(state.error) : null,
    loadMore,
    refresh,
    retry,
  };
}

/** Posts with local patches applied and deleted posts removed. */
function usePostList(key: string | null, fetchPage: (cursor: string | null) => Promise<Page<Post>>) {
  useSocialVersion();
  const r = usePaged<Post>(key, fetchPage, acceptServerPosts);
  return { ...r, items: r.items.filter((p) => !isDeleted(p.id)).map(applyPost) };
}

export function useFeed(feed: FeedKind, city: string | null, { limit, enabled = true }: { limit?: number; enabled?: boolean } = {}) {
  const on = useSocialEnabled() && enabled;
  const key = on ? `social:feed:${feed}:${feed === 'nearby' ? city ?? '' : ''}:${limit ?? ''}` : null;
  return usePostList(key, (cursor) => feedApi.get(feed, { cursor, city, limit }));
}

export function useUserPosts(userId: string | undefined, enabled = true) {
  const on = useSocialEnabled() && enabled && !!userId;
  return usePostList(on ? `social:posts:${userId}` : null, (cursor) => profileApi.posts(userId as string, cursor));
}

export function useSavedPosts(enabled = true) {
  const on = useSocialEnabled() && enabled;
  return usePostList(on ? 'social:saved' : null, (cursor) => profileApi.saved(cursor));
}

export function useFollowList(userId: string | undefined, kind: 'followers' | 'following' | 'requests') {
  const on = useSocialEnabled() && (kind === 'requests' || !!userId);
  useSocialVersion();
  const r = usePaged<Follower>(on ? `social:${kind}:${userId ?? 'me'}` : null, (cursor) =>
    kind === 'requests' ? followApi.requests(cursor) : kind === 'followers' ? followApi.followers(userId as string, cursor) : followApi.following(userId as string, cursor),
  );
  return { ...r, items: r.items.map((u) => ({ ...u, ...followStateOf(u.id, { following: u.following, requested: u.requested }) })) };
}

export function useComments(postId: string | undefined) {
  const on = useSocialEnabled() && !!postId;
  return usePaged<Comment>(on ? `social:comments:${postId}` : null, (cursor) => commentsApi.list(postId as string, cursor));
}

// ---------------------------------------------------------------------------
// Follow button state
// ---------------------------------------------------------------------------

/** Current follow state for a user (server value + any local change) and a toggle. */
export function useFollow(userId: string, server: FollowState) {
  useSocialVersion();
  const state = followStateOf(userId, server);
  const toggle = useCallback(() => setFollow(userId, !(state.following || state.requested), state), [userId, state]);
  return { ...state, toggle };
}

/** A single post with local patches (for rows rendered from a profile payload, etc.). */
export function usePostView(post: Post): Post {
  useSocialVersion();
  return applyPost(post);
}

/** Pull-to-refresh over a `useRemote` resource: spinner only for pulls, not background revalidation. */
export function usePullRefresh(loading: boolean, reload: () => void) {
  const [pulled, setPulled] = useState(false);
  // Adjusting state during render (not in an effect): the pull ends when its load does.
  if (pulled && !loading) setPulled(false);
  const refreshing = pulled && loading;
  const onRefresh = useCallback(() => {
    setPulled(true);
    reload();
  }, [reload]);
  return { refreshing, onRefresh };
}
