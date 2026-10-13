'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase, rpc, Usuario, SESSION_KEY } from './supabase';

interface AuthContextType {
  usuario: Usuario | null;
  loading: boolean;
  login: (usuario: string, password: string) => Promise<{ success: boolean; error?: string }>;
  cambiarPassword: (actual: string, nueva: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  usuario: null,
  loading: true,
  login: async () => ({ success: false }),
  cambiarPassword: async () => ({ success: false }),
  logout: () => {},
});

function guardar(token: string, usuario: Usuario) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, usuario }));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (s?.token && s?.usuario) setUsuario(s.usuario);
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
    localStorage.removeItem('el_extra_usuario'); // sesión de la versión anterior
    setLoading(false);
  }, []);

  // Primer inicio de sesión: obligar a cambiar la contraseña
  useEffect(() => {
    if (!loading && usuario?.must_change && pathname !== '/cambiar-password') {
      router.replace('/cambiar-password');
    }
  }, [loading, usuario, pathname, router]);

  const login = async (user: string, password: string) => {
    try {
      const { data, error } = await supabase.rpc('login', { p_usuario: user, p_password: password });
      if (error) throw error;
      const res = data as { error?: string; token?: string; usuario?: Usuario };
      if (res.error || !res.token || !res.usuario) {
        return { success: false, error: res.error || 'Usuario o contraseña incorrectos' };
      }
      guardar(res.token, res.usuario);
      setUsuario(res.usuario);
      return { success: true };
    } catch (err) {
      console.error('Login error:', err);
      return { success: false, error: 'Error de conexión. Intenta de nuevo.' };
    }
  };

  const cambiarPassword = useCallback(async (actual: string, nueva: string) => {
    try {
      const res = await rpc<{ error?: string; usuario?: Usuario }>('cambiar_password', {
        p_actual: actual,
        p_nueva: nueva,
      });
      if (res.error || !res.usuario) return { success: false, error: res.error || 'No se pudo cambiar' };
      const token = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}').token;
      guardar(token, res.usuario);
      setUsuario(res.usuario);
      return { success: true };
    } catch {
      return { success: false, error: 'Error de conexión. Intenta de nuevo.' };
    }
  }, []);

  const logout = () => {
    setUsuario(null);
    localStorage.removeItem(SESSION_KEY);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ usuario, loading, login, cambiarPassword, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
