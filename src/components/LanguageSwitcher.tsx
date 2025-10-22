import React from 'react';

type Props = {
  language: string;
  onChange: (lang: string) => void;
};

export default function LanguageSwitcher({ language, onChange }: Props) {
  return (
    <button onClick={() => onChange(language === 'pt' ? 'en' : 'pt')}>
      {language === 'pt' ? 'English' : 'Português'}
    </button>
  );
}
