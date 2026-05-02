import React, { createContext, useContext, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translations } from './translations';

const LANGUAGE_KEY = 'APP_LANGUAGE';

const LanguageContext = createContext({
  language: 'tr',
  t: (key) => key,
  setLanguage: () => {},
});

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState('tr');

  const setLanguage = useCallback(async (lang) => {
    setLanguageState(lang);
    await AsyncStorage.setItem(LANGUAGE_KEY, lang);
  }, []);

  const loadLanguage = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(LANGUAGE_KEY);
      if (stored && translations[stored]) {
        setLanguageState(stored);
      }
    } catch (_) {}
  }, []);

  const t = useCallback(
    (key) => {
      const langDict = translations[language] || translations.tr;
      return langDict[key] ?? translations.tr[key] ?? key;
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, t, setLanguage, loadLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = () => useContext(LanguageContext);
