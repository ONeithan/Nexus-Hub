import { App, Modal, setIcon } from 'obsidian';
import { NexusTradingCard } from '../services/achievements';

export class PackOpeningModal extends Modal {
    card: NexusTradingCard;
    isRevealed: boolean = false;

    constructor(app: App, card: NexusTradingCard) {
        super(app);
        this.card = card;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();

        // Add class to the Modal Window Wrapper (not just content) to style everything
        modalEl.addClass('nexus-pack-opening-layer');

        // Inject Styles (Scoped)
        const style = contentEl.createEl('style');
        style.textContent = `
            /* Remove standard modal window styling - NUCLEAR OPTION */
            .nexus-pack-opening-layer {
                background-color: transparent !important;
                border: none !important;
                box-shadow: none !important;
                /* Force full size to prevent clipping during animation */
                width: 100vw !important;
                height: 100vh !important;
                max-width: 100vw !important;
                max-height: 100vh !important;
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                margin: 0 !important;
                overflow: visible !important; /* Allow animation to spill if needed */
            }
            .nexus-pack-opening-layer .modal-content {
                background: transparent !important; 
                box-shadow: none !important; 
                border: none !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 0 !important;
                margin: 0 !important;
                width: 100% !important;
                height: 100% !important;
                overflow: visible !important;
            }
            
            /* Hide the close button completely */
            .nexus-pack-opening-layer .modal-close-button {
                display: none !important;
            }

            /* Optional: Dimmer styling if possible. 
               Note: modal-bg is usually a sibling of modalEl, so this might not hit it without global css.
               For this fix, we focus on the "Box" behind the card.
            */
            
            .pack-container {
                perspective: 1000px; 
                width: 320px; height: 480px; 
                position: relative;
                margin: 0 auto;
                cursor: pointer; transition: transform 0.5s;
                transform-style: preserve-3d;
            }
            .pack-container:hover { transform: scale(1.02); }
            
            /* Animation Timings - SLOWED DOWN */
            .pack-envelope {
                width: 100%; height: 100%; position: absolute; top: 0; left: 0;
                background: linear-gradient(135deg, #6366f1, #a855f7);
                border-radius: 20px; border: 4px solid #fff;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                box-shadow: 0 20px 50px rgba(0,0,0,0.5);
                z-index: 10; 
                transition: all 1.5s ease; /* Slower envelope open */
                backface-visibility: hidden;
            }
            .pack-envelope.shaking { animation: shake 0.8s ease-in-out infinite; }
            .pack-envelope.open { opacity: 0; transform: scale(1.5); pointer-events: none; }

            /* Card Visual Wrapper (Positioning & Animation) */
            .revealed-card {
                width: 100%; height: 100%;
                opacity: 0; transform: scale(0.5) translateY(50px);
                transition: all 2.0s cubic-bezier(0.34, 1.56, 0.64, 1);
                position: relative;
                margin: 0 auto;
                pointer-events: none; /* Disable clicks during animation */
            }
            .revealed-card.visible { 
                opacity: 1; transform: scale(1) translateY(0); 
                pointer-events: auto;
            }

            /* Inner Frame (The actual Card Look - Clipped) */
            .card-inner-frame {
                width: 100%; height: 100%;
                background: #000; 
                border-radius: 18px;
                border: 2px solid var(--card-color);
                box-shadow: 0 0 30px var(--card-color);
                display: flex; flex-direction: column;
                overflow: hidden; /* Fixes the pointy corners! */
                position: relative;
            }

            /* Custom Minimalist Close Button - FIXED FOR MOBILE */
            .custom-close-btn {
                position: absolute;
                top: 10px;
                right: 10px; 
                width: 36px; height: 36px;
                border-radius: 50%;
                background: rgba(0, 0, 0, 0.5); /* Easier to see */
                border: 1px solid rgba(255, 255, 255, 0.4);
                color: #fff;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer;
                opacity: 0;
                transition: opacity 1s ease 2s; 
                z-index: 100; /* Ensure on top */
            }
            .custom-close-btn:hover { background: rgba(255, 255, 255, 0.4); }
            .custom-close-btn svg { width: 16px; height: 16px; }
            .revealed-card.visible .custom-close-btn { opacity: 1; }

            .pack-logo svg { width: 80px; height: 80px; color: #fff; margin-bottom: 20px; }
            .tap-to-open { color: #fff; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; animation: pulse 2s infinite; }

            .card-art {
                flex: 1; background: #111; margin: 15px; border-radius: 12px;
                display: flex; align-items: center; justify-content: center;
                border: 1px solid rgba(255,255,255,0.1);
                position: relative; overflow: hidden;
            }
            .card-icon svg { width: 80px; height: 80px; color: var(--card-color); filter: drop-shadow(0 0 10px var(--card-color)); }
            
            .foil-shine {
                position: absolute; top: -100%; left: -100%; width: 300%; height: 300%;
                background: linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.4) 45%, rgba(255,255,255,0.7) 50%, rgba(255,255,255,0.4) 55%, transparent 60%);
                animation: shine 4s infinite ease-in-out;
                opacity: 0.6; pointer-events: none;
            }

            /* Card Details */
            .card-details {
                padding: 20px; display: flex; flex-direction: column; align-items: center; text-align: center;
                color: #fff; background: linear-gradient(to top, #000 20%, transparent);
            }
            .card-rarity {
                font-size: 0.7rem; font-weight: 800; letter-spacing: 2px;
                color: var(--card-color); text-transform: uppercase; margin-bottom: 8px;
            }
            .card-title {
                font-size: 1.4rem; font-weight: 700; margin-bottom: 10px; line-height: 1.2;
                text-shadow: 0 2px 10px rgba(0,0,0,0.8);
            }
            .card-desc {
                font-size: 0.85rem; color: #ccc; line-height: 1.4; margin-bottom: 15px;
            }
            .unlock-hint {
                font-size: 0.75rem; color: #888; font-style: italic;
                padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); width: 100%;
            }

            /* Keyframes */
            @keyframes shake {
                0% { transform: rotate(0deg); } 25% { transform: rotate(5deg); } 
                75% { transform: rotate(-5deg); } 100% { transform: rotate(0deg); }
            }
            @keyframes pulse { 0% { opacity: 0.7; } 50% { opacity: 1; } 100% { opacity: 0.7; } }
            @keyframes shine { 
                0% { transform: translate(-30%, -30%) rotate(0deg); } 
                20% { transform: translate(0%, 0%) rotate(0deg); }
                100% { transform: translate(30%, 30%) rotate(0deg); } 
            }
        `;

        const container = contentEl.createDiv({ cls: 'pack-container' });

        // -- Envelope Layer --
        const envelope = container.createDiv({ cls: 'pack-envelope' });
        const logo = envelope.createDiv({ cls: 'pack-logo' });
        setIcon(logo, 'package'); // Obsidian 'package' icon
        envelope.createDiv({ cls: 'tap-to-open', text: 'Clique para Abrir' });

        // -- Card Layer (Wrapper) --
        const cardEl = container.createDiv({ cls: 'revealed-card' });
        cardEl.style.setProperty('--card-color', this.card.color);

        // Custom Close Button (On Wrapper, Outside Inner)
        const closeBtn = cardEl.createDiv({ cls: 'custom-close-btn' });
        setIcon(closeBtn, 'x');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.close();
        });

        // -- Inner Frame (Styled & Clipped) --
        const innerFrame = cardEl.createDiv({ cls: 'card-inner-frame' });

        // Top Art
        const art = innerFrame.createDiv({ cls: 'card-art' });
        art.createDiv({ cls: 'foil-shine' });
        const iconContainer = art.createDiv({ cls: 'card-icon' });
        // Map generic icon for now
        let iconName = 'box';
        // Check both English and Portuguese
        const s = this.card.series.toLowerCase();
        if (s.includes('origin') || s.includes('financeira')) iconName = 'coins';
        else if (s.includes('cyberpunk') || s.includes('ética')) iconName = 'cpu';
        else if (s.includes('crypto') || s.includes('cripto') || s.includes('lendas')) iconName = 'server';
        else if (s.includes('luxury') || s.includes('luxuoso')) iconName = 'gem';
        setIcon(iconContainer, iconName);

        // Bottom Details
        const details = innerFrame.createDiv({ cls: 'card-details' });
        const rarityMap: Record<string, string> = {
            'Common': 'COMUM', 'Uncommon': 'INCOMUM', 'Rare': 'RARA', 'Epic': 'ÉPICA', 'Legendary': 'LENDÁRIA'
        };
        details.createDiv({ cls: 'card-rarity', text: rarityMap[this.card.rarity] || this.card.rarity });
        details.createDiv({ cls: 'card-title', text: this.card.name });
        details.createDiv({ cls: 'card-desc', text: this.card.description });

        // Added Unlock Hint
        const hintText = this.card.unlockHint || "Como desbloquear: Continue registrando novos dados no Nexus.";
        details.createDiv({ cls: 'unlock-hint', text: hintText });

        // Interaction Logic
        envelope.addEventListener('click', () => {
            if (this.isRevealed) return;
            this.isRevealed = true;

            envelope.addClass('shaking');

            // Wait for shake, then open (SLOWED DOWN TIMINGS)
            setTimeout(() => {
                envelope.removeClass('shaking');
                envelope.addClass('open');

                // Show card
                setTimeout(() => {
                    cardEl.addClass('visible');
                }, 800); // Delayed reveal (was 300)
            }, 1200); // Longer shake/buildup (was 800)
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
