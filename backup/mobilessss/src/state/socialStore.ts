/**
 * Shared client state for social entities, so a like on the post screen shows on the feed and a
 * follow on a profile shows on every Follow button — without a state library.
 *
 * Holds *patches* over server data (liked / counts / saved / follow state / deleted) plus the
 * optimistic actions that write them. A patch is dropped once fresher server data for that id
 * arrives, unless a request for it is still in flight.
 */
import { useSyncExternalStore } from 'react';
import { followApi, postsApi, type FollowResult, type Post } from '@/api/social';
import { invalidateRemote } from '@/api/useRemote';

type PostPatch = Partial<Pick<Post, 'liked_by_me' | 'likes_count' | 'saved_by_me' | 'comments_count'>>;
export type FollowState = { following: boolean; requested: boolean };

const postPatches = new Map<string, PostPatch>();
const followPatches = new Map<string, FollowState>();
const deleted = new Set<string>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

const emit = () => {
  version++;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getVersion = () => version;

/** Re-render when any social patch changes. */
export function useSocialVersion() {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

export const applyPost = (p: Post): Post => {
  const patch = postPatches.get(p.id);
  return patch ? { ...p, ...patch } : p;
};
export const isDeleted = (postId: string) => deleted.has(postId);
export const followStateOf = (userId: string, fallback: FollowState): FollowState => followPatches.get(userId) ?? fallback;

/** Fresh server rows win over settled patches. Call when a fetch resolves. */
export function acceptServerPosts(posts: Post[]) {
  let changed = false;
  for (const p of posts) {
    if (!pending.has(`post:${p.id}`) && postPatches.delete(p.id)) changed = true;
  }
  if (changed) emit();
}

export function acceptServerFollow(userId: string) {
  if (!pending.has(`user:${userId}`) && followPatches.delete(userId)) emit();
}

const patchPost = (id: string, patch: PostPatch) => {
  postPatches.set(id, { ...postPatches.get(id), ...patch });
  emit();
};

/**
 * Optimistic like/unlike. Rolls back and rethrows on failure; the server's count replaces the
 * optimistic one on success. Taps while a request is in flight are ignored.
 */
export async function toggleLike(post: Post): Promise<void> {
  const key = `post:${post.id}`;
  if (pending.has(key)) return;
  const before: PostPatch = { liked_by_me: post.liked_by_me, likes_count: post.likes_count };
  const liked = !post.liked_by_me;
  pending.add(key);
  patchPost(post.id, { liked_by_me: liked, likes_count: Math.max(0, post.likes_count + (liked ? 1 : -1)) });
  try {
    const r = liked ? await postsApi.like(post.id) : await postsApi.unlike(post.id);
    patchPost(post.id, { liked_by_me: r.liked, likes_count: r.likes_count });
  } catch (e) {
    patchPost(post.id, before);
    throw e;
  } finally {
    pending.delete(key);
  }
}

export async function toggleSave(post: Post): Promise<boolean> {
  const key = `save:${post.id}`;
  if (pending.has(key)) return post.saved_by_me;
  const saved = !post.saved_by_me;
  pending.add(key);
  patchPost(post.id, { saved_by_me: saved });
  try {
    await (saved ? postsApi.save(post.id) : postsApi.unsave(post.id));
    invalidatePagedPrefix('social:saved');
    return saved;
  } catch (e) {
    patchPost(post.id, { saved_by_me: !saved });
    throw e;
  } finally {
    pending.delete(key);
  }
}

export function bumpComments(post: Post, delta: number) {
  patchPost(post.id, { comments_count: Math.max(0, post.comments_count + delta) });
}

export async function deletePost(postId: string): Promise<void> {
  await postsApi.remove(postId);
  deleted.add(postId);
  invalidateRemote('social:me');
  invalidateRemote(`social:post:${postId}`);
  emit();
}

/**
 * Optimistic follow/unfollow. Private accounts answer with `requested` instead of `following`,
 * which the server result corrects. Profile caches are dropped so counts refetch.
 */
export async function setFollow(userId: string, follow: boolean, current: FollowState): Promise<FollowResult | null> {
  const key = `user:${userId}`;
  if (pending.has(key)) return null;
  pending.add(key);
  followPatches.set(userId, { following: follow, requested: false });
  emit();
  try {
    const r = follow ? await followApi.follow(userId) : await followApi.unfollow(userId);
    followPatches.set(userId, { following: r.following, requested: r.requested });
    invalidateRemote('social:me');
    invalidateRemote(`social:profile:${userId}`);
    invalidatePagedPrefix('social:feed:following');
    emit();
    return r;
  } catch (e) {
    followPatches.set(userId, current);
    emit();
    throw e;
  } finally {
    pending.delete(key);
  }
}

// ---------------------------------------------------------------------------
// First-page cache for paged lists (see hooks/useSocial.ts), cleared with the rest.
// ---------------------------------------------------------------------------

export const pagedCache = new Map<string, { items: unknown[]; next_cursor: string | null }>();

export function invalidatePagedPrefix(prefix: string) {
  for (const k of pagedCache.keys()) if (k.startsWith(prefix)) pagedCache.delete(k);
}

/** Sign-out: forget everything about the previous account. */
export function resetSocialState() {
  postPatches.clear();
  followPatches.clear();
  deleted.clear();
  pending.clear();
  pagedCache.clear();
  invalidateRemote('social:');
  emit();
}
