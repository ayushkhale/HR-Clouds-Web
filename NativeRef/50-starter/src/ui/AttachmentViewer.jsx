// ─────────────────────────────────────────────────────────────────────────────
// ui/AttachmentViewer.jsx — looking at an attachment or a payslip.
//
// ── NO WEBVIEW. NO PDF LIBRARY. ──────────────────────────────────────────────
//
// Images render inline. PDFs are handed to the OS viewer (blob-util fetches,
// file-viewer opens). A bundled PDF renderer costs several megabytes, renders
// worse than the OS one, and cannot print — and people already know their own
// PDF viewer.
//
// ── IT ALWAYS FETCHES A FRESH URL (T21) ──────────────────────────────────────
//
// Every view/download URL in this API is PRESIGNED AND SHORT-LIVED. Reusing one
// from a payload fetched five minutes ago gives a 403 that looks like "the file
// is gone". So: open → request a fresh link → use it immediately. The server
// sends `Cache-Control: private, no-store` on these responses precisely so a
// preview is re-fetched rather than remembered. Do not keep the path.
//
// ── LAYERING ─────────────────────────────────────────────────────────────────
//
//   RecordSheet 140 < AttachmentViewer 165 < ReasonPrompt 170 < Toast 200
//
// Render it as a SIBLING of the RecordSheet that linked to it, not a child.
//
// ── THE CACHE IS CLEARED ON SIGN-OUT ─────────────────────────────────────────
//
// Downloaded payslips sit in the app's cache directory. clearSession() calls
// clearDownloadCache() for exactly this reason: somebody else's salary must not
// be readable on a shared phone after a sign-out.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { downloadFile, fetchFileToCache, shareFile } from '../api/files';
import { errorMessage } from '../lib/errors';
import { icons } from '../theme/icons';
import { color, gutter, layer, space, text } from '../theme/tokens';
import { Button, IconButton } from './Button';
import { ErrorState } from './ErrorState';

const isImageType = (type, name) => {
  const t = String(type || '').toLowerCase();
  if (t.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|heic)$/i.test(String(name || ''));
};

/**
 * @param {object} props
 * @param {string} props.endpoint   the view-url endpoint — fetched FRESH here
 * @param {string} [props.filename]
 * @param {string} [props.contentType] from the record, to choose inline vs OS
 * @param {string} [props.title]
 * @param {Function} props.onClose
 * @param {'documents'|'payroll'|'attendance'} [props.domain] for error copy
 */
export function AttachmentViewer({
  endpoint,
  filename,
  contentType,
  title,
  onClose,
  domain = 'documents',
}) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState({ loading: true, path: null, error: null, type: contentType });
  const inline = isImageType(state.type || contentType, filename);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (isImageType(contentType, filename)) {
          // An image is shown in the app, so we need the bytes.
          const res = await fetchFileToCache(endpoint, { filename });
          if (cancelled) return;
          setState({ loading: false, path: res.path, error: null, type: res.contentType });
        } else {
          // Anything else goes straight to the OS viewer, and this component
          // only exists to report a failure. No second tap needed.
          await downloadFile(endpoint, { filename, open: true });
          if (cancelled) return;
          setState({ loading: false, path: null, error: null, type: contentType });
          onClose?.();
        }
      } catch (error) {
        if (!cancelled) setState({ loading: false, path: null, error, type: contentType });
      }
    })();

    return () => { cancelled = true; };
    // The endpoint is the identity of what is being viewed. A fresh open means
    // a fresh fetch, which is the point (T21).
  }, [endpoint, filename, contentType, onClose]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.92)', zIndex: layer.attachmentViewer }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[2],
            paddingTop: insets.top + space[2],
            paddingHorizontal: gutter,
            paddingBottom: space[2],
          }}
        >
          <Text numberOfLines={1} style={[text.bodyStrong, { flex: 1, color: color.textOnBrand }]}>
            {title || filename || 'Attachment'}
          </Text>
          <IconButton
            icon={icons.upload}
            tone="onDark"
            accessibilityLabel="Share this file"
            onPress={() => shareFile(endpoint, { filename }).catch(() => {})}
          />
          <IconButton icon={icons.close} tone="onDark" accessibilityLabel="Close" onPress={onClose} />
        </View>

        {state.loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3] }}>
            <ActivityIndicator color={color.textOnBrand} />
            <Text style={[text.small, { color: color.heroSubtitle }]}>Opening…</Text>
          </View>
        ) : state.error ? (
          <View style={{ flex: 1, justifyContent: 'center', backgroundColor: color.bg }}>
            <ErrorState
              error={state.error}
              domain={domain}
              fallback={errorMessage(state.error, domain, 'Couldn’t open this file.')}
              onRetry={null}
            />
            <View style={{ paddingHorizontal: gutter }}>
              <Button title="Close" variant="ghost" onPress={onClose} fullWidth />
            </View>
          </View>
        ) : inline && state.path ? (
          // Pinch-zoom via a nested scroll pair: the platform's own gesture,
          // and no extra dependency for one screen.
          <ScrollView
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          >
            <Image
              source={{ uri: `file://${state.path}` }}
              accessibilityLabel={filename || 'Attachment'}
              resizeMode="contain"
              style={{ width: '100%', height: '100%', minHeight: 320 }}
            />
          </ScrollView>
        ) : (
          <Pressable onPress={onClose} style={{ flex: 1 }} />
        )}
      </View>
    </Modal>
  );
}

export default AttachmentViewer;
