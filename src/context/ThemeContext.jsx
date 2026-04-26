import React, { createContext, useState, useContext, useEffect } from 'react';
import { db } from '../db/database';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    // Load theme from localStorage or database
    const loadTheme = async () => {
      try {
        // Try localStorage first
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
          setTheme(savedTheme);
          updateThemeClass(savedTheme);
          return;
        }

        // Try database
        const themeSetting = await db.settings.get('theme');
        if (themeSetting) {
          setTheme(themeSetting.value);
          updateThemeClass(themeSetting.value);
          localStorage.setItem('theme', themeSetting.value);
        } else {
          // Default to dark
          updateThemeClass('dark');
          localStorage.setItem('theme', 'dark');
        }
      } catch (error) {
        console.error('Failed to load theme:', error);
        updateThemeClass('dark');
        localStorage.setItem('theme', 'dark');
      }
    };
    loadTheme();
  }, []);

  const updateThemeClass = (selectedTheme) => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(selectedTheme);
  };

  const toggleTheme = async () => {
    try {
      const newTheme = theme === 'dark' ? 'light' : 'dark';
      setTheme(newTheme);
      updateThemeClass(newTheme);
      
      // Save theme preference to both localStorage and database
      localStorage.setItem('theme', newTheme);
      await db.settings.put({ key: 'theme', value: newTheme });
    } catch (error) {
      console.error('Failed to toggle theme:', error);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};