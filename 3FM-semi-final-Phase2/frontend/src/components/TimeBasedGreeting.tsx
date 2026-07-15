import React, { useState, useEffect } from 'react';

interface TimeBasedGreetingProps {
  userName?: string;
  className?: string;
}

export default function TimeBasedGreeting({ userName, className = '' }: TimeBasedGreetingProps) {
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const updateGreeting = () => {
      const hour = new Date().getHours();
      let message = '';

      if (hour >= 5 && hour < 12) {
        message = `Good Morning! 🌅 Ready to conquer the day${userName ? `, ${userName}` : ''}?`;
      } else if (hour >= 12 && hour < 17) {
        message = `Good Afternoon! ☀️ Let's keep the momentum going${userName ? `, ${userName}` : ''}!`;
      } else if (hour >= 17 && hour < 21) {
        message = `Good Evening! 👋 Almost done for the day${userName ? `, ${userName}` : ''}!`;
      } else {
        message = `Good Night! 🌙 Burning the midnight oil${userName ? `, ${userName}` : ''}?`;
      }

      setGreeting(message);
    };

    updateGreeting();
    // Update greeting every hour
    const interval = setInterval(updateGreeting, 3600000); // 1 hour in milliseconds

    return () => clearInterval(interval);
  }, [userName]);

  return (
    <div className={`text-sm font-medium text-gray-600 dark:text-gray-400 ${className}`}>
      {greeting}
    </div>
  );
}
