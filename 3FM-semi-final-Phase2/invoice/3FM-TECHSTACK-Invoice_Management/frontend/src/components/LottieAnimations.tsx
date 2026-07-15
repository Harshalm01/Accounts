import Lottie from 'lottie-react';
import { useState, useEffect } from 'react';

interface LottieAnimationProps {
  src: string;
  loop?: boolean;
  autoplay?: boolean;
  className?: string;
}

export const LottieAnimation = ({ src, loop = true, autoplay = true, className = "" }: LottieAnimationProps) => {
  const [animationData, setAnimationData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(src)
      .then((response) => {
        if (!response.ok) throw new Error('Failed to fetch');
        return response.json();
      })
      .then((data) => setAnimationData(data))
      .catch(() => {
        setError(true);
        // If external URL fails, return null to show fallback
      });
  }, [src]);

  if (error || !animationData) return <div className={className}></div>; // Empty div as fallback

  return (
    <div className={className}>
      <Lottie
        animationData={animationData}
        loop={loop}
        autoplay={autoplay}
      />
    </div>
  );
}

// Pre-defined popular Lottie animations
export const LoginLottie = ({ className = "w-20 h-20" }: { className?: string }) => (
  <LottieAnimation
    src="https://assets3.lottiefiles.com/packages/lf20_kkflmtur.json"
    className={className}
  />
);

export const SignupLottie = ({ className = "w-20 h-20" }: { className?: string }) => (
  <LottieAnimation
    src="https://assets8.lottiefiles.com/packages/lf20_jcikwtux.json"
    className={className}
  />
);

export const LoadingLottie = ({ className = "w-6 h-6" }: { className?: string }) => (
  <LottieAnimation
    src="https://assets4.lottiefiles.com/packages/lf20_szlepvdj.json"
    className={className}
  />
);

export const SecurityLottie = ({ className = "w-24 h-24" }: { className?: string }) => (
  <LottieAnimation
    src="https://assets2.lottiefiles.com/packages/lf20_EzNzEL.json"
    className={className}
  />
);

export const UserLottie = ({ className = "w-20 h-20" }: { className?: string }) => (
  <LottieAnimation
    src="https://assets4.lottiefiles.com/packages/lf20_x62chJ.json"
    className={className}
  />
);

export const CelebrationLottie = ({ className = "w-24 h-24" }: { className?: string }) => (
  <LottieAnimation
    src="https://assets9.lottiefiles.com/packages/lf20_aEFaHc.json"
    className={className}
  />
);

export const SuccessLottie = ({ className = "w-16 h-16" }: { className?: string }) => (
  <LottieAnimation
    src="https://assets4.lottiefiles.com/packages/lf20_jbrw3hcz.json"
    loop={false}
    className={className}
  />
);

export const ErrorLottie = ({ className = "w-16 h-16" }: { className?: string }) => (
  <LottieAnimation
    src="https://assets8.lottiefiles.com/packages/lf20_bmj45Qa2V7.json"
    loop={false}
    className={className}
  />
);

// Hero section animations
export const DashboardHeroLottie = ({ className = "w-full h-full" }: { className?: string }) => (
  <LottieAnimation
    src="https://assets5.lottiefiles.com/packages/lf20_V9t630.json"
    className={className}
  />
);

export const DataVisualizationLottie = ({ className = "w-64 h-64" }: { className?: string }) => (
  <LottieAnimation
    src="https://assets7.lottiefiles.com/packages/lf20_qmfs6c3i.json"
    className={className}
  />
);