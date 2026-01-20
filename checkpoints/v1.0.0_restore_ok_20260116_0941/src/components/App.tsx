import React, { useState } from 'react';
import { translations } from './i18n';
import LanguageSwitcher from './LanguageSwitcher';

export default function App() {
  const [language, setLanguage] = useState('pt');
  return (
    <div>
      <LanguageSwitcher language={language} onChange={setLanguage} />
      <h1>{translations[language].greeting}</h1>
      <button>{translations[language].botao}</button>
      {/* ...existing code... */}
    </div>
  );
}
