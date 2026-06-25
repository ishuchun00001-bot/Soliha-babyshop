import React, { useState } from 'react';
import { KeyRound, ShieldAlert, Sparkles } from 'lucide-react';
import { ADMIN_PASSWORD } from '../config';

export default function Login({ onLoginSuccess }) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        setError(false);
        
        if (password === ADMIN_PASSWORD) {
            localStorage.setItem("admin_logged_in", "true");
            localStorage.setItem("admin_token", password);
            onLoginSuccess();
        } else {
            setError(true);
        }
    };

    return (
        <div className="login-container">
            {/* Background decorative glows */}
            <div className="bg-glow bg-glow-1"></div>
            <div className="bg-glow bg-glow-2"></div>

            <div className="login-card">
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                    <div style={{
                        background: 'var(--primary-rose-light)',
                        padding: '1.2rem',
                        borderRadius: '50%',
                        color: 'var(--accent-terracotta)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <KeyRound size={40} />
                    </div>
                </div>
                
                <h1 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, marginBottom: '0.5rem', fontSize: '2rem' }}>
                    Admin Panel 🔐
                </h1>
                <p style={{ color: 'var(--text-muted)', marginBottom: '2.5rem', fontSize: '0.95rem' }}>
                    Soliha Baby Shop do'koni boshqaruv tizimi
                </p>
                
                <form onSubmit={handleSubmit}>
                    <div className="form-group" style={{ textAlign: 'left', marginBottom: '2rem' }}>
                        <label htmlFor="adminPass" style={{ fontWeight: 600 }}>Kirish Paroli:</label>
                        <input 
                            type="password" 
                            id="adminPass" 
                            required 
                            placeholder="Parolni kiriting" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={{ width: '100%' }}
                        />
                    </div>
                    
                    <button 
                        type="submit" 
                        className="btn-primary" 
                        style={{
                            width: '100%',
                            padding: '1.1rem',
                            fontSize: '1rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            borderRadius: 'var(--radius-sm)'
                        }}
                    >
                        <span>Tizimga Kirish</span>
                        <Sparkles size={16} />
                    </button>
                </form>

                {error && (
                    <div style={{
                        marginTop: '1.5rem',
                        color: 'var(--danger)',
                        background: '#FFF2F2',
                        padding: '0.8rem',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        fontSize: '0.9rem',
                        fontWeight: 600
                    }}>
                        <ShieldAlert size={16} />
                        <span>Noto'g'ri parol kiritildi!</span>
                    </div>
                )}
            </div>
        </div>
    );
}
