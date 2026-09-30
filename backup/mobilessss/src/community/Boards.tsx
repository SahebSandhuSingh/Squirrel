/**
 * XP boards from the Social service: today's (or this week's) top 10 by XP, with names, and
 * hostel vs hostel. XP is the Run Module's: runs and coached workouts, after its daily caps.
 */
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { communityApi, type BoardWindow, type XpBoardEntry } from '@/api/community';
import { useRemote } from '@/api/useRemote';
import { Avatar } from '@/components/Avatar';
import { BlockSkeleton, SocialError, toAvatarUser } from '@/components/socialParts';
import { Button, Display, FadeIn, Header, Icon, Kicker, Screen, Segmented } from '@/components/ui';
import { colors, fonts, radius } from '@/theme';

export const BOARDS = ['XP', 'Hostels', 'Territory'] as const;
export type BoardKind = (typeof BOARDS)[number];
const WINDOWS = ['Today', 'This week'] as const;
const WINDOW: Record<(typeof WINDOWS)[number], BoardWindow> = { Today: 'daily', 'This week': 'weekly' };

export function BoardSwitcher({ value, onChange }: { value: BoardKind; onChange: (b: BoardKind) => void }) {
  return <Segmented items={BOARDS} value={value} onChange={onChange} accent="secondary" />;
}

export function CommunityBoards({ board, switcher }: { board: 'XP' | 'Hostels'; switcher: ReactNode }) {
  const [win, setWin] = useState<(typeof WINDOWS)[number]>('Today');
  const w = WINDOW[win];
  const xp = useRemote(board === 'XP' ? `board:xp:${w}` : null, () => communityApi.xpBoard(w));
  const hostels = useRemote(board === 'Hostels' ? `board:hostels:${w}` : null, () => communityApi.hostelBoard(w));
  const active = board === 'XP' ? xp : hostels;

  return (
    <Screen tabBar={false}>
      <Header back title="" />
      <Kicker>{board === 'XP' ? 'Campus · top 10' : 'Hostel vs hostel'}</Kicker>
      <Display size={42} style={{ marginTop: 6 }}>
        {board === 'XP' ? <>Who&apos;s <Text style={{ color: colors.primary }}>moving</Text></> : <>Whose hostel <Text style={{ color: colors.primary }}>moves most</Text></>}
      </Display>
      {switcher}
      <Segmented items={WINDOWS} value={win} onChange={setWin} />
      <Text style={styles.source}>XP from runs and coached workouts · {win.toLowerCase()}</Text>
      {active.error && !active.data ? <SocialError error={new Error(active.error)} onRetry={active.reload} /> : null}
      {!active.data && active.loading ? <BlockSkeleton height={300} /> : null}

      {board === 'XP' && xp.data && (
        <>
          {!xp.data.available && <Note text="XP can't be reached right now. Try again in a minute." />}
          <View style={{ gap: 8 }}>{xp.data.entries.map((e, i) => <XpRow key={e.user.id} e={e} i={i} />)}</View>
          {xp.data.available && xp.data.entries.length === 0 && <Note text="Nobody has earned XP yet. A run or a workout puts you on top." />}
          {xp.data.me && !xp.data.entries.some((e) => e.is_me) && (
            <>
              <Text style={styles.gap}>···</Text>
              <XpRow e={xp.data.me} i={xp.data.entries.length} />
            </>
          )}
          {!xp.data.me && xp.data.available && <Note text="You're not on the board yet: earn XP today to get on it." />}
        </>
      )}

      {board === 'Hostels' && hostels.data && (
        !hostels.data.enabled ? (
          <Note text="Hostel vs hostel starts once the hostels are set up. Check back soon." />
        ) : (
          <>
            {!hostels.data.available && <Note text="XP can't be reached right now. Try again in a minute." />}
            <View style={{ gap: 8 }}>
              {hostels.data.entries.map((h, i) => (
                <FadeIn key={h.hostel} index={i}>
                  <View style={[styles.row, h.is_mine && styles.me, h.rank === 1 && h.xp > 0 && { borderColor: colors.primary }]}>
                    <Text style={[styles.rank, h.rank === 1 && h.xp > 0 && { color: colors.primary }]}>{String(h.rank).padStart(2, '0')}</Text>
                    <View style={styles.anon}>
                      <Icon name="home-city" size={18} color={h.is_mine ? colors.primary : colors.dim} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>{h.hostel}</Text>
                      <Text style={styles.meta}>{h.active} active · {h.members} member{h.members === 1 ? '' : 's'}</Text>
                    </View>
                    <Text style={styles.value}>{h.xp.toLocaleString('en-IN')} XP</Text>
                  </View>
                </FadeIn>
              ))}
            </View>
            {!hostels.data.entries.some((h) => h.is_mine) && (
              <Button label="Pick your hostel" variant="secondary" size="md" iconLeft="home-edit" onPress={() => router.push('/profile-edit')} style={{ marginTop: 14 }} />
            )}
          </>
        )
      )}
    </Screen>
  );
}

function XpRow({ e, i }: { e: XpBoardEntry; i: number }) {
  const top = e.rank === 1;
  return (
    <FadeIn index={i}>
      <View style={[styles.row, e.is_me && styles.me, top && { borderColor: colors.primary }]}>
        <Text style={[styles.rank, top && { color: colors.primary }]}>{String(e.rank).padStart(2, '0')}</Text>
        <Avatar user={toAvatarUser(e.user, e.is_me)} size={38} ring={top ? colors.primary : colors.lineHi} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{e.is_me ? 'You' : e.user.display_name}</Text>
          {!!e.hostel && <Text style={styles.meta}>{e.hostel}</Text>}
        </View>
        <Text style={styles.value}>{e.xp.toLocaleString('en-IN')} XP</Text>
      </View>
    </FadeIn>
  );
}

function Note({ text }: { text: string }) {
  return (
    <View style={styles.note}>
      <Icon name="information-outline" size={16} color={colors.dim} />
      <Text style={styles.noteText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  source: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10, marginBottom: 10, letterSpacing: 0.6, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 10 },
  me: { backgroundColor: 'rgba(215,255,31,0.08)', borderColor: 'rgba(215,255,31,0.4)' },
  rank: { color: colors.dim, fontFamily: fonts.monoBold, fontSize: 14, width: 26 },
  anon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.cardHi, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.text, fontFamily: fonts.label, fontSize: 15, letterSpacing: 0.6, textTransform: 'uppercase' },
  meta: { color: colors.dim, fontFamily: fonts.regular, fontSize: 11 },
  value: { color: colors.primary, fontFamily: fonts.labelBold, fontSize: 16 },
  gap: { color: colors.mute, textAlign: 'center', marginVertical: 6, fontFamily: fonts.bold, letterSpacing: 4 },
  note: { flexDirection: 'row', gap: 8, marginVertical: 12, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', padding: 12 },
  noteText: { flex: 1, color: colors.dim, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
});
