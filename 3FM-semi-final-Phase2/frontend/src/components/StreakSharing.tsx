import { useState } from 'react';

interface StreakSharingProps {
  currentStreak: number;
  longestStreak: number;
  userName: string;
}

export default function StreakSharing({
  currentStreak,
  longestStreak,
  userName,
}: StreakSharingProps) {
  const [copied, setCopied] = useState(false);

  const shareMessage = `I'm on a ${currentStreak} day streak on 3FM! 🔥 My longest streak is ${longestStreak} days. Join me and build your own streak!`;
  const shareUrl = `https://3fm.example.com/streaks/${userName}`;

  const handleCopyToClipboard = () => {
    const fullMessage = `${shareMessage}\n\n${shareUrl}`;
    navigator.clipboard.writeText(fullMessage).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const shareOnTwitter = () => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareMessage)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(twitterUrl, '_blank', 'width=600,height=400');
  };

  const shareOnLinkedin = () => {
    const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
    window.open(linkedinUrl, '_blank', 'width=600,height=400');
  };

  const shareViaEmail = () => {
    const emailBody = `${shareMessage}\n\n${shareUrl}`;
    const mailtoLink = `mailto:?subject=Check out my 3FM Streak! 🔥&body=${encodeURIComponent(emailBody)}`;
    window.location.href = mailtoLink;
  };

  return (
    <div className="space-y-4">
      {/* Streak Stats Card */}
      <div className="bg-gradient-to-br from-orange-500 to-red-600 rounded-xl p-6 text-white shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm opacity-90">Current Streak</p>
            <h3 className="text-4xl font-bold">{currentStreak} 🔥</h3>
          </div>
          <div className="text-right">
            <p className="text-sm opacity-90">Longest Streak</p>
            <p className="text-2xl font-bold">{longestStreak}</p>
          </div>
        </div>
        <p className="text-sm opacity-90">Keep the momentum going!</p>
      </div>

      {/* Share Message Preview */}
      <div className="bg-gray-50 dark:bg-zinc-800 rounded-xl p-4 border border-gray-200 dark:border-zinc-700">
        <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Share Message</p>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          {shareMessage}
        </p>
      </div>

      {/* Share Options */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">Share Your Streak</p>

        <div className="grid grid-cols-2 gap-2">
          {/* Twitter Share */}
          <button
            onClick={shareOnTwitter}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2s9 5 20 5a9.5 9.5 0 00-9-5.5c4.75 2.25 9 5.5 9 5.5z" />
            </svg>
            Twitter
          </button>

          {/* LinkedIn Share */}
          <button
            onClick={shareOnLinkedin}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z" />
              <circle cx="4" cy="4" r="2" />
            </svg>
            LinkedIn
          </button>

          {/* Email Share */}
          <button
            onClick={shareViaEmail}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-600 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Email
          </button>

          {/* Copy to Clipboard */}
          <button
            onClick={handleCopyToClipboard}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 font-semibold rounded-lg transition-colors ${
              copied
                ? 'bg-green-600 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Share Tip */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
        <p className="text-xs text-blue-700 dark:text-blue-300">
          💡 <strong>Tip:</strong> Share your streak progress daily to stay motivated and inspire others!
        </p>
      </div>
    </div>
  );
}
