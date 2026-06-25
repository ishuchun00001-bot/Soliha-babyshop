import React, { useState, useEffect } from 'react';
import Storefront from './components/Storefront';
import AdminPanel from './components/AdminPanel';
import Login from './components/Login';

export default function App() {
    // Custom lightweight path-based router
    const [path, setPath] = useState(window.location.pathname);
    const [isLoggedIn, setIsLoggedIn] = useState(() => {
        return localStorage.getItem("admin_logged_in") === "true";
    });

    useEffect(() => {
        const handleLocationChange = () => {
            setPath(window.location.pathname);
        };
        window.addEventListener('popstate', handleLocationChange);
        return () => window.removeEventListener('popstate', handleLocationChange);
    }, []);

    const navigate = (newPath) => {
        window.history.pushState({}, '', newPath);
        setPath(newPath);
    };

    const handleLoginSuccess = () => {
        setIsLoggedIn(true);
        navigate('/admin');
    };

    const handleLogout = () => {
        localStorage.removeItem("admin_logged_in");
        localStorage.removeItem("admin_token");
        setIsLoggedIn(false);
        navigate('/');
    };

    // Render components based on path
    if (path === '/admin') {
        if (isLoggedIn) {
            return <AdminPanel onLogout={handleLogout} />;
        } else {
            return <Login onLoginSuccess={handleLoginSuccess} />;
        }
    }

    if (path === '/login') {
        if (isLoggedIn) {
            navigate('/admin');
            return null;
        }
        return <Login onLoginSuccess={handleLoginSuccess} />;
    }

    // Default to storefront for any other path (including /)
    return <Storefront />;
}
