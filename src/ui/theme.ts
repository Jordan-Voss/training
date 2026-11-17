import { useColorScheme, useWindowDimensions } from 'react-native';
import { useTraining } from '../data/runtime';
export const light = {
  background: '#F7F8FA',
  surface: '#FFFFFF',
  text: '#15181E',
  secondary: '#5A6472',
  accent: '#2457F5',
  selected: '#EAF0FF',
  divider: '#E4E7EC',
  danger: '#B42318',
  success: '#187247',
  buttonText: '#FFFFFF',
};
export const dark = {
  background: '#0F1115',
  surface: '#191C23',
  text: '#F2F4F8',
  secondary: '#A5ADBA',
  accent: '#779CFF',
  selected: '#222F51',
  divider: '#333A47',
  danger: '#FF9B91',
  success: '#81D3A6',
  buttonText: '#0F1115',
};
export function useTheme() {
  const state = useTraining();
  const system = useColorScheme();
  const isDark =
    state.settings.theme === 'dark' || (state.settings.theme === 'system' && system === 'dark');
  const { width } = useWindowDimensions();
  return { ...(isDark ? dark : light), isDark, wide: width >= 1000, compact: width < 600 };
}
