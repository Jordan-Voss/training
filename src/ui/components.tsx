import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { AlertCircle, Check, ChevronRight, Cloud, HardDrive } from 'lucide-react-native';
import { useRuntime, useTraining } from '../data/runtime';
import { useTheme } from './theme';
export function T({
  children,
  muted = false,
  size = 16,
  weight = '400',
  style,
  role,
}: {
  children: React.ReactNode;
  muted?: boolean;
  size?: number;
  weight?: TextStyle['fontWeight'];
  style?: StyleProp<TextStyle>;
  role?: 'header' | 'alert';
}) {
  const c = useTheme();
  return (
    <Text
      accessibilityRole={role}
      style={[
        {
          fontSize: size,
          lineHeight: size * 1.4,
          color: muted ? c.secondary : c.text,
          fontWeight: weight,
          fontVariant: ['tabular-nums'],
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
  icon,
  small = false,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  small?: boolean;
  accessibilityLabel?: string;
}) {
  const c = useTheme();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 44,
          paddingHorizontal: small ? 12 : 20,
          paddingVertical: 10,
          borderRadius: 8,
          backgroundColor: secondary ? c.surface : c.accent,
          borderWidth: secondary ? 1 : 0,
          borderColor: focused ? c.accent : c.divider,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
        hovered && { opacity: 0.85 },
      ]}
    >
      {icon}
      <Text
        style={{
          color: secondary ? c.accent : c.buttonText,
          fontSize: small ? 14 : 16,
          fontWeight: '600',
          lineHeight: 23,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Row({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }, style]}
    >
      {children}
    </View>
  );
}
export function Stack({
  children,
  gap = 16,
  style,
}: {
  children: React.ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[{ gap }, style]}>{children}</View>;
}
export function Divider() {
  const c = useTheme();
  return <View style={{ height: 1, backgroundColor: c.divider }} />;
}
export function Page({
  title,
  subtitle,
  children,
  action,
  hideTitle = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  hideTitle?: boolean;
}) {
  const c = useTheme();
  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        padding: c.compact ? 20 : 40,
        paddingBottom: 60,
        maxWidth: 1380,
        width: '100%',
        alignSelf: 'center',
        gap: 28,
      }}
      style={{ flex: 1, backgroundColor: c.background }}
    >
      {!hideTitle ? (
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Stack gap={4}>
            <T role="header" size={28} weight="700">
              {title}
            </T>
            {subtitle ? <T muted>{subtitle}</T> : null}
          </Stack>
          {action}
        </Row>
      ) : null}
      <Notice />
      {children}
    </ScrollView>
  );
}
export function Notice() {
  const { notice, dismiss } = useRuntime();
  const c = useTheme();
  return notice ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Dismiss message"
      onPress={dismiss}
      style={{
        padding: 14,
        borderWidth: 1,
        borderColor: c.divider,
        borderRadius: 8,
        backgroundColor: c.surface,
      }}
    >
      <Row>
        <AlertCircle size={20} color={c.danger} />
        <T role="alert" style={{ flex: 1 }}>
          {notice}
        </T>
        <T muted>Dismiss</T>
      </Row>
    </Pressable>
  ) : null;
}
export function SyncLine() {
  const state = useTraining();
  const { deviceSaving, user, store, cloudReady } = useRuntime();
  const c = useTheme();
  const pending =
    state.outbox.length + state.activities.filter((a) => a.syncStatus === 'pending').length;
  const failed = state.outbox.some((o) => o.status === 'conflict');
  return (
    <Stack gap={6}>
      <Row>
        {deviceSaving ? (
          <ActivityIndicator size="small" color={c.accent} />
        ) : (
          <HardDrive size={16} color={c.secondary} />
        )}
        <T size={13} muted>
          {store.getError()
            ? 'Device save failed · Keep this notebook open'
            : deviceSaving
              ? 'Saving on this device…'
              : state.savedAt
                ? 'Saved on this device'
                : 'Device save pending'}
        </T>
      </Row>
      <Row>
        <Cloud size={16} color={c.secondary} />
        <T size={13} muted>
          {!user
            ? 'Local demo · Cloud sync off'
            : !cloudReady
              ? 'Cloud connection needs attention'
              : failed
                ? 'Cloud conflict · Review in Profile'
                : pending
                  ? `${pending} cloud save${pending === 1 ? '' : 's'} pending`
                  : 'Cloud saves up to date'}
        </T>
      </Row>
      {state.media.some((m) => m.status !== 'uploaded') ? (
        <T size={13} muted>
          {state.media.filter((m) => m.status !== 'uploaded').length} video upload(s) pending
        </T>
      ) : null}
    </Stack>
  );
}
export function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  numeric = false,
  disabled = false,
  maxLength,
  compact = false,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  numeric?: boolean;
  disabled?: boolean;
  maxLength?: number;
  compact?: boolean;
}) {
  const c = useTheme();
  const [draft, setDraft] = useState(value ?? '');
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(value ?? '');
  }, [value, focused]);
  return (
    <View style={{ gap: 6, flex: compact ? 1 : undefined, minWidth: compact ? 52 : undefined }}>
      {!compact ? (
        <T size={14} muted>
          {label}
        </T>
      ) : null}
      <TextInput
        accessibilityLabel={label}
        value={draft}
        editable={!disabled}
        maxLength={maxLength ?? (multiline ? 4000 : 100)}
        placeholder={placeholder ?? (numeric ? '—' : '')}
        placeholderTextColor={c.secondary}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        inputMode={numeric ? 'decimal' : undefined}
        multiline={multiline}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChangeText={(v) => {
          setDraft(v);
          onChange(v);
        }}
        style={{
          minHeight: 44,
          paddingHorizontal: 10,
          paddingVertical: 10,
          borderWidth: 1,
          borderColor: focused ? c.accent : c.divider,
          borderRadius: 6,
          backgroundColor: c.surface,
          color: c.text,
          fontSize: 16,
          fontVariant: ['tabular-nums'],
          textAlign: compact ? 'center' : 'left',
          textAlignVertical: multiline ? 'top' : 'center',
          opacity: disabled ? 0.6 : 1,
          ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
        }}
      />
    </View>
  );
}
export function Choice<TValue extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: TValue;
  options: { value: TValue; label: string }[];
  onChange: (value: TValue) => void;
  label: string;
}) {
  const c = useTheme();
  return (
    <Row style={{ gap: 6 }}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${o.label}`}
          accessibilityState={{ selected: o.value === value }}
          onPress={() => onChange(o.value)}
          style={{
            minHeight: 44,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: o.value === value ? c.accent : c.divider,
            backgroundColor: o.value === value ? c.selected : c.surface,
          }}
        >
          <T size={14} style={{ color: o.value === value ? c.accent : c.secondary }}>
            {o.label}
          </T>
        </Pressable>
      ))}
    </Row>
  );
}
export function ListItem({
  title,
  subtitle,
  onPress,
  trailing,
}: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
}) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: c.divider,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <Stack gap={3} style={{ flex: 1 }}>
          <T weight="600">{title}</T>
          {subtitle ? (
            <T size={14} muted>
              {subtitle}
            </T>
          ) : null}
        </Stack>
        {trailing ?? (onPress ? <ChevronRight size={20} color={c.secondary} /> : null)}
      </Row>
    </Pressable>
  );
}
export function Empty({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <Stack gap={12} style={{ paddingVertical: 36, maxWidth: 560 }}>
      <T size={22} weight="600">
        {title}
      </T>
      <T muted>{body}</T>
      {children}
    </Stack>
  );
}
export const styles = StyleSheet.create({
  fill: { flex: 1 },
  number: { fontVariant: ['tabular-nums'] },
});
