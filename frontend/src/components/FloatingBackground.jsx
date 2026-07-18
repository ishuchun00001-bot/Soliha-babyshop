import React, { useEffect, useRef, useState } from 'react';

// Premium minimalist children fashion SVG items
const CLOTHING_SVGS = [
    // Kids T-Shirt
    <svg viewBox="0 0 100 100" fill="currentColor">
        <path d="M 30,20 L 42,12 C 43,11 44,11 45,12 L 55,12 C 56,11 57,11 58,12 L 70,20 C 72,21 72,23 71,24 L 62,35 C 61,36 59,36 58,35 L 58,80 C 58,83 55,85 52,85 L 48,85 C 45,85 42,83 42,80 L 42,35 C 41,36 39,36 38,35 L 29,24 C 28,23 28,21 30,20 Z" />
        <path d="M 45,12 C 45,18 55,18 55,12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="42" y1="35" x2="58" y2="35" stroke="currentColor" strokeWidth="2.5" opacity="0.3" />
    </svg>,
    // Dress
    <svg viewBox="0 0 100 100" fill="currentColor">
        <path d="M 38,15 C 38,12 42,10 45,11 L 55,11 C 58,10 62,12 62,15 L 65,22 C 65,25 61,26 59,25 L 59,32 L 75,78 C 76,81 74,85 70,85 L 30,85 C 26,85 24,81 25,78 L 41,32 L 41,25 C 39,26 35,25 35,22 Z" />
        <path d="M 45,11 C 45,17 55,17 55,11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="50" cy="40" r="2" opacity="0.4" />
        <circle cx="50" cy="50" r="2" opacity="0.4" />
        <circle cx="50" cy="60" r="2" opacity="0.4" />
    </svg>,
    // Baby Romper
    <svg viewBox="0 0 100 100" fill="currentColor">
        <path d="M 35,15 L 43,10 C 44,9 46,9 47,10 L 53,10 C 54,9 56,9 57,10 L 65,15 C 67,16 67,18 65,19 L 58,25 L 58,62 C 58,65 59,66 61,67 L 66,70 C 68,71 67,74 65,74 L 54,74 C 52,74 51,72 50,70 C 49,72 48,74 46,74 L 35,74 C 33,74 32,71 34,70 L 39,67 C 41,66 42,65 42,62 L 42,25 L 35,19 C 33,18 33,16 35,15 Z" />
        <path d="M 43,10 C 43,16 57,16 57,10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="42" y1="28" x2="58" y2="28" stroke="currentColor" strokeWidth="2" opacity="0.3" />
    </svg>,
    // Shorts
    <svg viewBox="0 0 100 100" fill="currentColor">
        <path d="M 25,20 L 75,20 C 78,20 80,22 80,25 L 75,65 C 74,68 71,70 68,70 L 52,70 C 51,68 49,65 48,65 C 47,65 45,68 44,70 L 28,70 C 25,70 22,68 21,65 L 16,25 C 16,22 18,20 21,20 Z" />
        <line x1="25" y1="28" x2="75" y2="28" stroke="currentColor" strokeWidth="2" opacity="0.3" />
    </svg>,
    // Pants
    <svg viewBox="0 0 100 100" fill="currentColor">
        <path d="M 28,15 L 72,15 C 75,15 77,17 77,20 L 70,82 C 70,84 68,85 66,85 L 53,85 C 51,85 50,83 49,80 L 47,40 L 45,80 C 44,83 43,85 41,85 L 28,85 C 26,85 24,84 24,82 L 17,20 C 17,17 19,15 22,15 Z" />
        <line x1="28" y1="25" x2="72" y2="25" stroke="currentColor" strokeWidth="2" opacity="0.3" />
    </svg>,
    // Hoodie
    <svg viewBox="0 0 100 100" fill="currentColor">
        {/* Hood */}
        <path d="M 38,30 C 38,15 62,15 62,30 C 62,35 60,38 58,40 L 42,40 C 40,38 38,35 38,30 Z" opacity="0.8" />
        {/* Body */}
        <path d="M 28,38 L 40,32 L 60,32 L 72,38 C 74,39 74,42 72,43 L 64,55 C 63,56 61,56 60,55 L 60,80 C 60,83 57,85 54,85 L 46,85 C 43,85 40,83 40,80 L 40,55 C 39,56 37,56 36,55 L 28,43 C 26,42 26,39 28,38 Z" />
        {/* Pocket */}
        <path d="M 44,65 L 56,65 L 58,75 L 42,75 Z" opacity="0.5" />
    </svg>,
    // Baby Jacket
    <svg viewBox="0 0 100 100" fill="currentColor">
        <path d="M 28,25 L 42,18 C 43,17 44,17 45,18 L 55,18 C 56,17 57,17 58,18 L 72,25 C 74,26 74,28 73,30 L 64,48 C 63,50 61,50 60,49 L 60,80 C 60,83 57,85 54,85 L 46,85 C 43,85 40,83 40,80 L 40,49 C 39,50 37,50 36,48 L 27,30 C 26,28 26,26 28,25 Z" />
        {/* Zipper/Line */}
        <line x1="50" y1="18" x2="50" y2="85" stroke="currentColor" strokeWidth="2" opacity="0.4" />
        <circle cx="46" cy="35" r="2" opacity="0.4" />
        <circle cx="46" cy="50" r="2" opacity="0.4" />
        <circle cx="46" cy="65" r="2" opacity="0.4" />
    </svg>,
    // Baby Shoes
    <svg viewBox="0 0 100 100" fill="currentColor">
        <path d="M 25,60 C 25,45 35,40 50,40 C 65,40 75,45 75,60 C 75,75 68,80 50,80 C 32,80 25,75 25,60 Z" />
        <path d="M 42,40 C 42,30 45,20 50,20 C 55,20 58,30 58,40" fill="none" stroke="currentColor" strokeWidth="3" />
        <line x1="38" y1="52" x2="62" y2="52" stroke="currentColor" strokeWidth="2.5" opacity="0.4" />
        <line x1="35" y1="60" x2="65" y2="60" stroke="currentColor" strokeWidth="2.5" opacity="0.4" />
    </svg>,
    // Kids Cap
    <svg viewBox="0 0 100 100" fill="currentColor">
        <path d="M 20,55 C 20,30 80,30 80,55 C 80,57 78,59 75,59 L 25,59 C 22,59 20,57 20,55 Z" />
        {/* Bill */}
        <path d="M 75,56 C 85,56 93,62 90,68 C 87,71 78,71 70,64" opacity="0.9" />
        <circle cx="50" cy="35" r="4" opacity="0.7" />
    </svg>,
    // Socks
    <svg viewBox="0 0 100 100" fill="currentColor">
        <path d="M 35,15 L 52,15 C 54,15 55,16 55,18 L 55,45 C 55,47 62,50 64,52 L 72,60 C 74,62 74,66 71,68 C 67,72 58,72 52,68 L 38,54 C 36,52 35,50 35,48 L 35,18 C 35,16 36,15 38,15 Z" />
        <line x1="35" y1="22" x2="55" y2="22" stroke="currentColor" strokeWidth="2" opacity="0.4" />
        <line x1="35" y1="28" x2="55" y2="28" stroke="currentColor" strokeWidth="2" opacity="0.4" />
    </svg>,
    // Skirt
    <svg viewBox="0 0 100 100" fill="currentColor">
        <path d="M 32,20 L 68,20 C 71,20 73,22 72,25 L 82,75 C 83,78 80,80 77,80 L 23,80 C 20,80 17,78 18,75 L 28,25 C 27,22 29,20 32,20 Z" />
        <line x1="30" y1="28" x2="70" y2="28" stroke="currentColor" strokeWidth="2" opacity="0.3" />
        <line x1="26" y1="50" x2="74" y2="50" stroke="currentColor" strokeWidth="1.5" opacity="0.2" />
    </svg>,
    // Overalls
    <svg viewBox="0 0 100 100" fill="currentColor">
        {/* Straps */}
        <path d="M 34,15 C 34,22 38,30 38,38 M 66,15 C 66,22 62,30 62,38" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
        {/* Chest Panel */}
        <path d="M 34,35 L 66,35 C 68,35 69,37 68,39 L 65,52 L 35,52 L 32,39 C 31,37 32,35 34,35 Z" />
        {/* Pants bottom */}
        <path d="M 32,50 L 68,50 C 71,50 73,52 73,55 L 68,82 C 67,84 65,85 63,85 L 52,85 C 51,83 49,81 48,81 C 47,81 45,83 44,85 L 33,85 C 31,85 29,84 28,82 L 23,55 C 23,52 25,50 28,50 Z" />
    </svg>
];

// Luxury Scandinavian Muted Palette
const PALETTE_COLORS = [
    '#EADEC9', // Creamy Beige
    '#E6DFD3', // Sand
    '#E5E5E5', // Soft Muted Gray
    '#D3D3D3', // Light Natural Wood Gray
    '#F3EBE9', // Extremely Muted Pastel Pink
    '#EAECE6', // Muted Sage
    '#F0EBE1', // Warm Ivory
    '#DFD5C6'  // Cream
];

export default function FloatingBackground() {
    const containerRef = useRef(null);
    const requestRef = useRef(null);
    const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
    const [elements, setElements] = useState([]);

    // Initialize random elements positioned purely around content (mostly left & right edges)
    useEffect(() => {
        const generated = [];
        const count = window.innerWidth < 768 ? 12 : 26; // Less items on mobile for performance

        for (let i = 0; i < count; i++) {
            // Determine layer
            let layer = 1;
            if (i % 3 === 0) layer = 1;      // Largest, slowest, lowest opacity
            else if (i % 3 === 1) layer = 2; // Medium
            else layer = 3;                 // Smallest, fastest, highest opacity

            // Position bias: Half on the left, half on the right to keep center completely readable
            const side = Math.random() < 0.5 ? 'left' : 'right';
            const xPercent = side === 'left' 
                ? Math.random() * 25 // 0% to 25% of screen width
                : 75 + Math.random() * 25; // 75% to 100% of screen width

            const yPercent = Math.random() * 100;

            // Layer characteristics
            let size = 90;
            let opacity = 0.03;
            let speed = 0.15;
            let blur = 3;

            if (layer === 1) {
                size = 110 + Math.random() * 40; // 110px - 150px
                opacity = 0.025 + Math.random() * 0.02; // 0.025 - 0.045
                speed = 0.1 + Math.random() * 0.1; // Slow
                blur = 2.5 + Math.random() * 1.5; // Blurry
            } else if (layer === 2) {
                size = 70 + Math.random() * 30; // 70px - 100px
                opacity = 0.04 + Math.random() * 0.02; // 0.04 - 0.06
                speed = 0.25 + Math.random() * 0.15;
                blur = 1 + Math.random() * 1;
            } else {
                size = 45 + Math.random() * 20; // 45px - 65px
                opacity = 0.055 + Math.random() * 0.025; // 0.055 - 0.08
                speed = 0.45 + Math.random() * 0.25; // Fast
                blur = 0; // Sharp
            }

            generated.push({
                id: i,
                svgIndex: Math.floor(Math.random() * CLOTHING_SVGS.length),
                color: PALETTE_COLORS[Math.floor(Math.random() * PALETTE_COLORS.length)],
                x: xPercent,
                y: yPercent,
                size,
                opacity,
                speed,
                blur,
                layer,
                angle: Math.random() * Math.PI * 2,
                rotation: Math.random() * 360,
                rotationSpeed: (Math.random() - 0.5) * 0.15,
                // Offset tracking for floating motion
                currentX: 0,
                currentY: 0,
                targetRotation: 0,
                waveSpeed: 0.005 + Math.random() * 0.008,
                waveRadius: 10 + Math.random() * 15
            });
        }
        setElements(generated);
    }, []);

    // Track mouse coordinates for smooth parallax
    useEffect(() => {
        const handleMouseMove = (e) => {
            mouseRef.current.targetX = (e.clientX - window.innerWidth / 2) * 0.03; // max 15px offset
            mouseRef.current.targetY = (e.clientY - window.innerHeight / 2) * 0.03;
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
        };
    }, []);

    // Floating animation loop (requestAnimationFrame with Page Visibility API support)
    useEffect(() => {
        if (elements.length === 0) return;

        let lastTime = performance.now();
        const animate = (time) => {
            // Check if page is hidden to save CPU
            if (document.hidden) {
                requestRef.current = requestAnimationFrame(animate);
                return;
            }

            const dt = (time - lastTime) * 0.06;
            lastTime = time;

            // Interpolate mouse movements for inertia parallax
            mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.06;
            mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.06;

            setElements((prev) =>
                prev.map((el) => {
                    // 1. Natural slow floating upward flow
                    let newY = el.y - el.speed * dt;
                    if (newY < -20) {
                        newY = 120; // Wrap around to bottom
                    }

                    // 2. Wave horizontal offset using Sin/Cos
                    const newAngle = el.angle + el.waveSpeed * dt;
                    const waveX = Math.sin(newAngle) * el.waveRadius;

                    // 3. Smooth continuous rotation
                    const newRotation = el.rotation + el.rotationSpeed * dt;

                    // 4. Parallax shifts based on layer depth (Layer 3 shifts more than Layer 1)
                    const parallaxFactor = el.layer === 3 ? 1.4 : el.layer === 2 ? 1.0 : 0.6;
                    const parallaxX = mouseRef.current.x * parallaxFactor;
                    const parallaxY = mouseRef.current.y * parallaxFactor;

                    return {
                        ...el,
                        y: newY,
                        angle: newAngle,
                        currentX: waveX + parallaxX,
                        currentY: parallaxY,
                        rotation: newRotation
                    };
                })
            );

            requestRef.current = requestAnimationFrame(animate);
        };

        requestRef.current = requestAnimationFrame(animate);
        return () => {
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
        };
    }, [elements.length]);

    return (
        <div
            ref={containerRef}
            className="floating-luxury-background"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 0,
                overflow: 'hidden',
                backgroundColor: 'transparent'
            }}
        >
            {/* Ambient luxury sunlight beams */}
            <div style={{
                position: 'absolute',
                top: '-30%',
                left: '-20%',
                width: '150%',
                height: '150%',
                background: 'radial-gradient(circle at 10% 10%, rgba(240, 238, 222, 0.06) 0%, rgba(255, 255, 255, 0) 60%)',
                pointerEvents: 'none',
                mixBlendMode: 'soft-light'
            }} />
            
            {/* Ambient subtle light leak */}
            <div style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: '600px',
                height: '600px',
                background: 'radial-gradient(circle, rgba(230, 223, 211, 0.04) 0%, rgba(255, 255, 255, 0) 70%)',
                pointerEvents: 'none',
                mixBlendMode: 'soft-light'
            }} />

            {/* Subtle floating dust/glowing particles */}
            <div className="subtle-particles-layer" style={{ position: 'absolute', width: '100%', height: '100%' }}>
                {[...Array(8)].map((_, i) => (
                    <div
                        key={`particle-${i}`}
                        style={{
                            position: 'absolute',
                            width: `${2 + (i % 3)}px`,
                            height: `${2 + (i % 3)}px`,
                            borderRadius: '50%',
                            backgroundColor: 'rgba(234, 222, 201, 0.25)',
                            top: `${(i * 13) % 100}%`,
                            left: `${(i * 27) % 100}%`,
                            filter: 'blur(0.5px)',
                            opacity: 0.3,
                            animation: `float-dust ${35 + i * 5}s infinite linear`
                        }}
                    />
                ))}
            </div>

            {/* Floating fashion SVGs */}
            {elements.map((el) => (
                <div
                    key={el.id}
                    style={{
                        position: 'absolute',
                        left: `${el.x}%`,
                        top: `${el.y}%`,
                        width: `${el.size}px`,
                        height: `${el.size}px`,
                        opacity: el.opacity,
                        filter: `blur(${el.blur}px) drop-shadow(0 12px 24px rgba(0, 0, 0, 0.03))`,
                        color: el.color,
                        transform: `translate3d(${el.currentX}px, ${el.currentY}px, 0) rotate(${el.rotation}deg)`,
                        willChange: 'transform, opacity',
                        transition: 'opacity 0.5s ease',
                        pointerEvents: 'none',
                        zIndex: el.layer
                    }}
                >
                    {CLOTHING_SVGS[el.svgIndex]}
                </div>
            ))}

            <style dangerouslySetInnerHTML={{__html: `
                @keyframes float-dust {
                    0% { transform: translate3d(0, 0, 0) rotate(0deg); }
                    50% { transform: translate3d(30px, -50px, 0) rotate(180deg); }
                    100% { transform: translate3d(0, -100px, 0) rotate(360deg); }
                }
            `}} />
        </div>
    );
}
