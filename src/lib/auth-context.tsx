'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase, SubPadrino } from './supabase';

interface AuthContextType {
  usuario: SubPadrino | null;
  loading: boolean;
  login: (nombre: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  usuario: null,
  loading: true,
  login: async () => ({ success: false }),
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<SubPadrino | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('el_extra_usuario');
    if (stored) {
      try {
        setUsuario(JSON.parse(stored));
      } catch {
        localStorage.removeItem('el_extra_usuario');
      }
    }
    setLoading(false);
  }, []);

  const login = async (nombre: string, pin: string) => {
    const { data, error } = await supabase
      .from('sub_padrinos')
      .select('*')
      .ilike('nombre', nombre.trim())
      .eq('pin', pin.trim())
      .single();

    if (error || !data) {
      return { success: false, error: 'Nombre o PIN incorrecto' };
    }

    setUsuario(data);
    localStorage.setItem('el_extra_usuario', JSON.stringify(data));
    return { success: true };
  };

  const logout = () => {
    setUsuario(null);
    localStorage.removeItem('el_extra_usuario');
  };

  return (
    <AuthContext.Provider value={{ usuario, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
