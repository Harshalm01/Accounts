import { useState } from 'react';

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt?: string;
  progress?: number;
  maxProgress?: number;
  category: 'campaign' | 'team' | 'milestone';
}

const ACHIEVEMENT_LIST: Achievement[] = [
  {
    id: 'first-campaign',
    name: 'Campaign Creator',
    description: 'Create your first campaign',
    icon: '🚀',
    category: 'campaign',
  },
  {
    id: 'five-campaigns',
    name: 'Campaign Master',
    description: 'Create 5 successful campaigns',
    icon: '🎯',
    category: 'campaign',
  },
  {
    id: 'team-growth',
    name: 'Team Builder',
    description: 'Add 10 team members',
    icon: '👥',
    category: 'team',
  },
  {
    id: 'streak-week',
    name: 'Week Warrior',
    description: 'Maintain a 7-day streak',
    icon: '🔥',
    category: 'milestone',
  },
  {
    id: 'streak-month',
    name: 'Month Marathon',
    description: 'Maintain a 30-day streak',
    icon: '⚡',
    category: 'milestone',
  },
  {
    id: 'zero-errors',
    name: 'Perfect Execution',
    description: 'Complete a campaign with zero errors',
    icon: '✨',
    category: 'campaign',
  },
  {
    id: 'early-bird',
    name: 'Early Bird',
    description: 'Complete 5 assignments before deadline',
    icon: '🌅',
    category: 'milestone',
  },
  {
    id: 'collaboration',
    name: 'Collaboration Champion',
    description: 'Work on 10 team campaigns',
    icon: '🤝',
    category: 'team',
  },
];

interface TeamAchievementsProps {
  unlockedAchievementIds?: string[];
  userAchievements?: Achievement[];
}

export default function TeamAchievements({
  unlockedAchievementIds = [],
  userAchievements = ACHIEVEMENT_LIST,
}: TeamAchievementsProps) {
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'campaign' | 'team' | 'milestone'>('all');

  const unlockedAchievements = userAchievements.filter((a) =>
    unlockedAchievementIds.includes(a.id)
  );
  const lockedAchievements = userAchievements.filter(
    (a) => !unlockedAchievementIds.includes(a.id)
  );

  const filteredUnlocked =
    selectedCategory === 'all'
      ? unlockedAchievements
      : unlockedAchievements.filter((a) => a.category === selectedCategory);
  const filteredLocked =
    selectedCategory === 'all'
      ? lockedAchievements
      : lockedAchievements.filter((a) => a.category === selectedCategory);

  const categoryLabels = {
    campaign: '🎬 Campaign',
    team: '👥 Team',
    milestone: '⭐ Milestone',
  };

  return (
    <div className="space-y-6">
      {/* Achievement Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl p-4 text-white text-center">
          <p className="text-3xl font-bold">{unlockedAchievements.length}</p>
          <p className="text-xs opacity-90">Unlocked</p>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl p-4 text-white text-center">
          <p className="text-3xl font-bold">{lockedAchievements.length}</p>
          <p className="text-xs opacity-90">Locked</p>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-4 text-white text-center">
          <p className="text-3xl font-bold">
            {Math.round((unlockedAchievements.length / userAchievements.length) * 100)}%
          </p>
          <p className="text-xs opacity-90">Progress</p>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-4 py-2 rounded-lg whitespace-nowrap font-semibold transition-colors ${
            selectedCategory === 'all'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700'
          }`}
        >
          All Achievements
        </button>
        <button
          onClick={() => setSelectedCategory('campaign')}
          className={`px-4 py-2 rounded-lg whitespace-nowrap font-semibold transition-colors ${
            selectedCategory === 'campaign'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700'
          }`}
        >
          🎬 Campaigns
        </button>
        <button
          onClick={() => setSelectedCategory('team')}
          className={`px-4 py-2 rounded-lg whitespace-nowrap font-semibold transition-colors ${
            selectedCategory === 'team'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700'
          }`}
        >
          👥 Team
        </button>
        <button
          onClick={() => setSelectedCategory('milestone')}
          className={`px-4 py-2 rounded-lg whitespace-nowrap font-semibold transition-colors ${
            selectedCategory === 'milestone'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700'
          }`}
        >
          ⭐ Milestones
        </button>
      </div>

      {/* Unlocked Achievements */}
      {filteredUnlocked.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-600 dark:text-gray-400 mb-3 uppercase tracking-wider">
            ✨ Unlocked ({filteredUnlocked.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredUnlocked.map((achievement) => (
              <div
                key={achievement.id}
                className="bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-amber-900/20 dark:to-orange-900/20 border-2 border-amber-300 dark:border-amber-700 rounded-xl p-4 text-center hover:shadow-lg transition-shadow cursor-pointer group"
              >
                <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">
                  {achievement.icon}
                </div>
                <h4 className="font-bold text-gray-900 dark:text-white text-sm">
                  {achievement.name}
                </h4>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {achievement.description}
                </p>
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mt-2">
                  {achievement.unlockedAt
                    ? new Date(achievement.unlockedAt).toLocaleDateString()
                    : 'Recently'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Locked Achievements */}
      {filteredLocked.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-400 dark:text-gray-600 mb-3 uppercase tracking-wider">
            🔒 Locked ({filteredLocked.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredLocked.map((achievement) => (
              <div
                key={achievement.id}
                className="bg-gray-100 dark:bg-zinc-800 border-2 border-gray-300 dark:border-zinc-700 rounded-xl p-4 text-center opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
              >
                <div className="text-4xl mb-2 inline-block relative">
                  {achievement.icon}
                  <svg
                    className="w-4 h-4 absolute -top-1 -right-1 text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-zinc-800 rounded-full p-0.5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 1C6.48 1 2 5.48 2 11s4.48 10 10 10 10-4.48 10-10S17.52 1 12 1zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 6 15.5 6 14 6.67 14 7.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 6 8.5 6 7 6.67 7 7.5 7.67 9 8.5 9zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
                  </svg>
                </div>
                <h4 className="font-bold text-gray-700 dark:text-gray-300 text-sm">
                  {achievement.name}
                </h4>
                <p className="text-xs text-gray-600 dark:text-gray-500 mt-1">
                  {achievement.description}
                </p>
                {achievement.progress !== undefined && achievement.maxProgress !== undefined && (
                  <div className="mt-2 bg-gray-300 dark:bg-zinc-700 rounded-full h-1.5">
                    <div
                      className="bg-indigo-600 h-1.5 rounded-full transition-all"
                      style={{
                        width: `${(achievement.progress / achievement.maxProgress) * 100}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {filteredUnlocked.length === 0 && filteredLocked.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500 dark:text-gray-400">No achievements in this category yet.</p>
        </div>
      )}
    </div>
  );
}
