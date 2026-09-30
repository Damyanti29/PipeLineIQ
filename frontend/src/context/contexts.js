import { createContext } from 'react'

// Context objects live here so provider files only export components (keeps Fast Refresh working).
export const AuthContext = createContext(null)
export const ThemeContext = createContext(null)
