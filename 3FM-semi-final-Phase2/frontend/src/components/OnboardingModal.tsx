import { useState } from 'react';
import { LottieAnimation } from './LottieAnimations';

interface OnboardingStep {
  lottieUrl: string;
  title: string;
  description: string;
}

interface OnboardingModalProps {
  userRole: string;
  onComplete: () => void;
  onSkip: () => void;
}

const STEPS_BY_ROLE: Record<string, OnboardingStep[]> = {
  ADMIN: [
    {
      lottieUrl: 'https://assets3.lottiefiles.com/packages/lf20_kkflmtur.json',
      title: 'Welcome, Admin!',
      description: "You have full control of the 3FM platform. Let's take a quick tour of what you can do.",
    },
    {
      lottieUrl: 'https://assets4.lottiefiles.com/packages/lf20_x62chJ.json',
      title: 'Manage Your Team',
      description: 'Create, edit, and assign roles to team members from the Users page. Set permissions for Agency, Employee, and Brand accounts.',
    },
    {
      lottieUrl: 'https://assets5.lottiefiles.com/packages/lf20_V9t630.json',
      title: 'Campaigns Overview',
      description: 'Monitor all active and upcoming campaigns, assign campaign heads, and track progress in real time.',
    },
    {
      lottieUrl: 'https://assets7.lottiefiles.com/packages/lf20_qmfs6c3i.json',
      title: 'Analytics & Reports',
      description: 'Deep dive into performance data across influencers and campaigns with built-in analytics dashboards.',
    },
    {
      lottieUrl: 'https://assets9.lottiefiles.com/packages/lf20_aEFaHc.json',
      title: "You're All Set!",
      description: "The platform is yours to command. Start by exploring the Influencer database or setting up a new campaign.",
    },
  ],
  AGENCY: [
    {
      lottieUrl: 'https://assets3.lottiefiles.com/packages/lf20_kkflmtur.json',
      title: 'Welcome to 3FM!',
      description: 'Streamline your influencer marketing campaigns from one powerful dashboard built for agencies.',
    },
    {
      lottieUrl: 'https://assets4.lottiefiles.com/packages/lf20_x62chJ.json',
      title: 'Influencer Database',
      description: 'Browse, filter, and build shortlists from thousands of influencer profiles. Compare them side-by-side before adding to a campaign.',
    },
    {
      lottieUrl: 'https://assets5.lottiefiles.com/packages/lf20_V9t630.json',
      title: 'Create Campaigns',
      description: 'Set up campaigns, add influencers, assign team members, track deliverables and live dates — all in one place.',
    },
    {
      lottieUrl: 'https://assets8.lottiefiles.com/packages/lf20_jcikwtux.json',
      title: 'Pitch to Brands',
      description: 'Send professional pitches to brands, track their response status, and close deals faster.',
    },
    {
      lottieUrl: 'https://assets9.lottiefiles.com/packages/lf20_aEFaHc.json',
      title: "You're Good to Go!",
      description: 'Start by exploring the Influencers page or creating your first campaign. Use G→C to navigate fast.',
    },
  ],
  EMPLOYEE: [
    {
      lottieUrl: 'https://assets3.lottiefiles.com/packages/lf20_kkflmtur.json',
      title: 'Welcome to the Team!',
      description: "Here's a quick guide to your workspace on 3FM.",
    },
    {
      lottieUrl: 'https://assets5.lottiefiles.com/packages/lf20_V9t630.json',
      title: 'Your Assignments',
      description: 'View and manage campaigns assigned to you from the Campaign section. Accept or reject assignments and stay on top of your tasks.',
    },
    {
      lottieUrl: 'https://assets8.lottiefiles.com/packages/lf20_jcikwtux.json',
      title: 'Chat & Collaborate',
      description: 'Use All Hands for direct messages with teammates and join group conversations tied to specific campaigns.',
    },
    {
      lottieUrl: 'https://assets7.lottiefiles.com/packages/lf20_qmfs6c3i.json',
      title: 'Content Calendar',
      description: 'Track all influencer live dates and content deliverables in the Calendar view so nothing slips through.',
    },
    {
      lottieUrl: 'https://assets9.lottiefiles.com/packages/lf20_aEFaHc.json',
      title: 'Ready to Go!',
      description: 'Check your assigned campaigns to get started. Reach out to your team lead if you need anything.',
    },
  ],
  BRAND: [
    {
      lottieUrl: 'https://assets3.lottiefiles.com/packages/lf20_kkflmtur.json',
      title: 'Welcome, Brand Partner!',
      description: "Your brand's influencer campaigns, pitch proposals, and performance data — all in one place.",
    },
    {
      lottieUrl: 'https://assets5.lottiefiles.com/packages/lf20_V9t630.json',
      title: 'Your Campaigns',
      description: 'Track all active and completed campaigns being run on your behalf. See real-time status updates as they happen.',
    },
    {
      lottieUrl: 'https://assets4.lottiefiles.com/packages/lf20_x62chJ.json',
      title: 'Influencer Performance',
      description: 'See which influencers are delivering for your brand and review their live content links and engagement data.',
    },
    {
      lottieUrl: 'https://assets8.lottiefiles.com/packages/lf20_jcikwtux.json',
      title: 'Approve Deliverables',
      description: 'Review influencer content submissions and approve or leave comments directly from your campaign dashboard.',
    },
    {
      lottieUrl: 'https://assets9.lottiefiles.com/packages/lf20_aEFaHc.json',
      title: 'All Set!',
      description: 'Explore your brand profile to get the full picture. Your agency team is here to support you every step of the way.',
    },
  ],
};

export default function OnboardingModal({ userRole, onComplete, onSkip }: OnboardingModalProps) {
  const [step, setStep] = useState(0);

  const steps = STEPS_BY_ROLE[userRole] || STEPS_BY_ROLE.AGENCY;
  const current = steps[step];
  const isLast = step === steps.length - 1;
  const progress = ((step + 1) / steps.length) * 100;

  const handleNext = () => {
    if (isLast) {
      onComplete();
    } else {
      setStep((s) => s + 1);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-gray-100 dark:bg-zinc-800">
          <div
            className="h-1 bg-indigo-600 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="px-8 py-8 flex flex-col items-center text-center">
          {/* Step counter */}
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-6">
            Step {step + 1} of {steps.length}
          </p>

          {/* Lottie Animation */}
          <div className="w-48 h-48 mb-6">
            <LottieAnimation src={current.lottieUrl} className="w-full h-full" />
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
            {current.title}
          </h2>

          {/* Description */}
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed max-w-sm">
            {current.description}
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 pb-4">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`rounded-full transition-all duration-300 ${
                i === step
                  ? 'w-6 h-2 bg-indigo-600'
                  : i < step
                  ? 'w-2 h-2 bg-indigo-400'
                  : 'w-2 h-2 bg-gray-200 dark:bg-zinc-700'
              }`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-8 py-5 border-t border-gray-100 dark:border-zinc-800">
          <button
            onClick={onSkip}
            className="text-sm font-medium text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            Skip tour
          </button>

          <div className="flex items-center gap-3">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border border-gray-200 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
            >
              {isLast ? 'Get Started' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
