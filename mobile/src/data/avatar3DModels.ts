/**
 * 3D avatar models for the "Make it You" 3D preview (src/app/avatar.tsx).
 *
 * These started as raw AI-generated scans (~350k–430k vertices, 20–34 MB each). They've
 * been run through gltfpack + glTF-Transform (simplified to ~40k triangles, quantized,
 * textures resized to 1536² WebP), which brings each file to ~0.7 MB — about 2.8 MB for
 * all four instead of ~100 MB. The pipeline is documented in README → "3D avatar previews".
 */

import urban01 from '../../assets/models/urban-01.glb';
import urban02 from '../../assets/models/urban-02.glb';
import urban03 from '../../assets/models/urban-03.glb';
import signalOrange from '../../assets/models/signal-orange.glb';

export type Avatar3DModel = {
  id: string;
  name: string;
  /** Imported .glb — Metro resolves this to a local asset module (see metro.config.js). */
  file: number;
  /**
   * True if the source scan has a real third-party logo (e.g. a Nike swoosh) baked into
   * its texture. Such models are only listed in development builds (`__DEV__`) — using a
   * brand's mark on a character skin without a licence is a trademark risk, so swap or
   * re-texture before any public build.
   */
  hasThirdPartyBranding?: boolean;
};

const all: Avatar3DModel[] = [
  { id: 'urban-01', name: 'Urban 01', file: urban01 },
  { id: 'urban-02', name: 'Urban 02', file: urban02 },
  { id: 'urban-03', name: 'Urban 03', file: urban03, hasThirdPartyBranding: true },
  { id: 'signal-orange', name: 'Signal Orange', file: signalOrange },
];

/** Models offered in the picker. Branded scans are dev-only. */
export const avatar3DModels: Avatar3DModel[] = all.filter((m) => __DEV__ || !m.hasThirdPartyBranding);
