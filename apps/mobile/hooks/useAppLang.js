import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import i18n from "../i18n";

const LangCtx = createContext({ lang: "ru", setLang: (_l) => {} });

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(i18n.language || "ru");

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem("app:lang");
      if (saved && saved !== lang) {
        setLangState(saved);
        i18n.changeLanguage(saved);
      }
    })();
  }, []);

  const setLang = async (l) => {
    setLangState(l);
    await AsyncStorage.setItem("app:lang", l);
    i18n.changeLanguage(l);
  };

  return (
    <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>
  );
}

export const useAppLang = () => useContext(LangCtx);
