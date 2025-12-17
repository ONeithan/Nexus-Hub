const BASE_XP = 100;
const GROWTH_RATE = 1.5;

/**
 * Calculates the total experience required to reach a specific level.
 * @param level The target level.
 * @returns The total experience required.
 */
export function getExperienceForLevel(level: number): number {
    if (level <= 1) return 0;
    return Math.floor(BASE_XP * (Math.pow(GROWTH_RATE, level - 1) - 1) / (GROWTH_RATE - 1));
}

/**
 * Calculates the current level based on the total experience points.
 * @param points The total experience points.
 * @returns The current level.
 */
export function calculateLevel(points: number): number {
    if (points < 0) return 1;
    let level = 1;
    while (points >= getExperienceForLevel(level + 1)) {
        level++;
    }
    return level;
}

/**
 * Calculates the experience needed to reach the next level.
 * @param level The current level.
 * @returns The amount of experience needed for the next level.
 */
export function getExperienceForNextLevel(level: number): number {
    return getExperienceForLevel(level + 1) - getExperienceForLevel(level);
}

/**
 * Returns a dynamic title based on the user's level.
 * @param level The user's current level.
 */
export function getRankTitle(level: number): string {
    if (level < 5) return "Novato";
    if (level < 10) return "Explorador";
    if (level < 20) return "Analista";
    if (level < 30) return "Estrategista";
    if (level < 50) return "Magnata";
    return "Lenda";
}

import { NexusHubSettings } from '../views/settings';
export function isBadgeUnlocked(badgeId: string, settings: NexusHubSettings): boolean {
    const collectedCards = (settings.collectedCards || []).length;
    const achCount = (settings.achievements || []).length;
    const totalPoints = (settings.achievements || []).reduce((sum, a) => sum + a.points, 0);
    const level = calculateLevel(totalPoints);
    const hasEmergencyFund = settings.emergencyFund && settings.emergencyFund.currentBalance > 0 && settings.emergencyFund.currentBalance >= (settings.emergencyFund.targetAmount || 1);

    switch (badgeId) {
        case 'badge_newbie': return true; // Always unlocked for installing
        case 'badge_saver': return level >= 5;
        case 'badge_investor': return level >= 10;
        case 'badge_tycoon': return level >= 20;
        case 'badge_collector': return collectedCards >= 10;
        case 'badge_guardian': return !!hasEmergencyFund;
        case 'badge_legend': return achCount >= 50; // Example for Legend
        default: return false;
    }
}
