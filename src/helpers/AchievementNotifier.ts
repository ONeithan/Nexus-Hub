declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

import { setIcon } from 'obsidian';
import { Achievement } from '../services/achievements';
import { gsap } from 'gsap'; // Import GSAP
import NexusHubPlugin from '../main'; // Import NexusHubPlugin

export class AchievementNotifier {
  private static notificationQueue: { plugin: NexusHubPlugin, achievement: Achievement }[] = [];
  private static isDisplayingNotification = false;

  public static show(plugin: NexusHubPlugin, achievement: Achievement) {
    this.notificationQueue.push({ plugin, achievement });
    this.processQueue();
  }

  private static async processQueue() {
    if (this.isDisplayingNotification || this.notificationQueue.length === 0) {
      return;
    }

    this.isDisplayingNotification = true;
    const { plugin, achievement } = this.notificationQueue.shift()!;

    const containerId = 'nexus-achievement-notifier-container';
    let container = document.getElementById(containerId);

    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      document.body.appendChild(container);
    }

    const notificationEl = document.createElement('div');
    notificationEl.addClass('achievement-notification');

    const circleEl = notificationEl.createDiv({ cls: 'achievement-icon' });
    const trophyIconEl = circleEl.createSpan({ cls: 'trophy-icon' });
    trophyIconEl.setText('🏆');

    const detailsEl = notificationEl.createDiv({ cls: 'achievement-details' });
    const textContainer = detailsEl.createDiv({ cls: 'achievement-text' });
    textContainer.createSpan({ cls: 'achievement-text-subtitle', text: 'CONQUISTA DESBLOQUEADA' });
    textContainer.createSpan({ cls: 'achievement-text-title', text: achievement.name });

    const rewardContainer = detailsEl.createDiv({ cls: 'achievement-reward' });
    const diamondIconEl = rewardContainer.createSpan({ cls: 'diamond-icon' });
    diamondIconEl.setText('💎');
    rewardContainer.createSpan({ text: `${achievement.points}` });

    container.appendChild(notificationEl);

    const tl = gsap.timeline({
      onStart: () => {
        (async () => {
          try {
            // Mobile-safe path resolution
            const adapter = plugin.app.vault.adapter;
            const audioPath = `${plugin.manifest.dir}/assets/conquista.mp3`;

            if (await adapter.exists(audioPath)) {
              const arrayBuffer = await adapter.readBinary(audioPath);
              const AudioContext = window.AudioContext || (window as any).webkitAudioContext;

              if (AudioContext) {
                const audioContext = new AudioContext();
                audioContext.decodeAudioData(arrayBuffer, (buffer) => {
                  const source = audioContext.createBufferSource();
                  source.buffer = buffer;
                  source.connect(audioContext.destination);
                  source.start(0);
                }, (e) => {
                  console.warn('[Nexus Hub] Audio decode error (safe to ignore on some devices):', e);
                });
              }
            }
          } catch (error) {
            console.warn('[Nexus Hub] Audio playback failed (mobile limitation or missing file):', error);
          }
        })();
      },
      onComplete: () => {
        gsap.to(notificationEl, {
          opacity: 0,
          duration: 0.5,
          delay: 3,
          onComplete: () => {
            notificationEl.remove();
            if (container && container.children.length === 0) {
              container.remove();
            }
            this.isDisplayingNotification = false;
            this.processQueue();
          }
        });
      }
    });

    tl.to(circleEl, {
      opacity: 1,
      scale: 1,
      duration: 0.5,
      ease: 'power2.out'
    });

    tl.to(detailsEl, {
      maxWidth: '300px',
      paddingLeft: '15px',
      paddingRight: '15px',
      duration: 0.7,
      ease: 'power2.out'
    }, ">");
  }
}

/* Inject CSS for the notifier*/
document.head.appendChild(document.createElement('style')).innerHTML = `
#nexus-achievement-notifier-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  /* Removed gap: 10px; to ensure no space between notifications */
}

/* O CONTÊINER-PAI: A PÍLULA COMPLETA */
.achievement-notification {
  display: flex;
  align-items: center;
  height: 50px; /* Define a altura da pílula */
  border-radius: 25px; /* Arredonda todos os cantos para formar a pílula */
  overflow: hidden; /* CRÍTICO: Mascara o conteúdo que transborda */
  background-color: rgba(20, 20, 20, 0.85); /* Fundo da pílula */
  /* IMPORTANTE: NENHUMA animação ou transição aqui */
}

/* O FILHO 1 (CÍRCULO): Agora é apenas o wrapper do ícone */
.achievement-icon {
  /* Geometria */
  width: 50px;
  height: 50px;
  /* Removido border-radius e background-color, pois o pai define a forma e a cor */
  
  /* Centralizar o ícone do troféu */
  display: grid;
  place-items: center;
  flex-shrink: 0; /* Garante que o círculo não encolha */

  /* --- ESTADO INICIAL (PARA GSAP) --- */
  opacity: 0;
  transform: scale(0.5);
}

/* O ÍCONE DO TROFÉU (Dentro do Círculo) */
.trophy-icon {
  /* Use a cor OURO para 'Rei do Lucro' */
  color: #ffd700; 
  font-size: 24px; /* Ajustar tamanho */
}

/* O FILHO 2 (RETÂNGULO): Agora é apenas o wrapper dos detalhes */
.achievement-details {
  /* Removido background-color e margin-left, pois o pai define a cor e a forma */
  height: 100%; /* Preenche a altura do pai */
  flex-grow: 1; /* Permite que ele ocupe o espaço restante */

  /* --- Removido border-radius: 25px; --- */

  /* --- A "MÁSCARA" (CRÍTICO) --- */
  /* Esconde o conteúdo que transborda (texto/diamante) */
  overflow: hidden; 
  /* Impede que o texto quebre a linha durante a animação */
  white-space: nowrap; 

  /* Layout interno */
  display: flex;
  align-items: center;
  justify-content: space-between;

  /* --- ESTADO INICIAL (PARA GSAP) --- */
  /* Começa fechado e sem padding */
  max-width: 0;
  padding-left: 0;
  padding-right: 0;
}

/* O CONTEÚDO DO RETÂNGULO */
.achievement-text {
  display: flex;
  flex-direction: column;
  color: white;
}
.achievement-text-subtitle {
  font-size: 12px;
  color: #AAAAAA; /* Cinza claro */
  font-weight: normal;
}
.achievement-text-title {
  font-size: 16px;
  font-weight: bold;
}

.achievement-reward {
  display: flex;
  align-items: center;
  color: #FFD700; /* Amarelo brilhante */
  font-weight: bold;
}

/* O ÍCONE DE DIAMANTE (Dentro da Recompensa) */
.diamond-icon {
  /* Use um ícone de DIAMANTE MULTIFACETADO (estilo joia) */
  margin-right: 5px;
  font-size: 16px; 
}
`;