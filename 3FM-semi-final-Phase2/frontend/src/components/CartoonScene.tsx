import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface CartoonSceneProps {
  isActive: boolean;
}

export default function CartoonScene({ isActive }: CartoonSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const objectsRef = useRef<THREE.Mesh[]>([]);
  const animationIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) {
      // Stop animation if not active
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      return;
    }

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    // Get container dimensions
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 5;

    // Renderer setup with transparent background
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x1a1a2e, 0.3);

    // Clear container and add renderer
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting - brighter
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 10, 10);
    scene.add(directionalLight);

    const objects: THREE.Mesh[] = [];

    // Character 1: Red cube head
    const headGeom = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xff6b6b, emissive: 0xff4444 });
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.set(-2, 1, 0);
    scene.add(head);
    objects.push(head);

    // Eyes
    const eyeGeom = new THREE.SphereGeometry(0.25, 32, 32);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff });
    const eye1 = new THREE.Mesh(eyeGeom, eyeMat);
    eye1.position.set(-2.4, 1.3, 0.8);
    scene.add(eye1);

    const eye2 = new THREE.Mesh(eyeGeom, eyeMat);
    eye2.position.set(-1.6, 1.3, 0.8);
    scene.add(eye2);

    // Pupils
    const pupilGeom = new THREE.SphereGeometry(0.12, 32, 32);
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x000000 });
    const pupil1 = new THREE.Mesh(pupilGeom, pupilMat);
    pupil1.position.set(-2.4, 1.3, 1.05);
    scene.add(pupil1);

    const pupil2 = new THREE.Mesh(pupilGeom, pupilMat);
    pupil2.position.set(-1.6, 1.3, 1.05);
    scene.add(pupil2);

    // Character 2: Yellow sphere
    const bodyGeom = new THREE.SphereGeometry(1, 32, 32);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffd93d, emissive: 0xffaa00 });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.set(0, 0, 0);
    scene.add(body);
    objects.push(body);

    // Arms
    const armGeom = new THREE.CylinderGeometry(0.25, 0.25, 1.8, 32);
    const armMat = new THREE.MeshStandardMaterial({ color: 0xffa500, emissive: 0xff8800 });
    const arm1 = new THREE.Mesh(armGeom, armMat);
    arm1.position.set(-1.3, 0, 0);
    arm1.rotation.z = Math.PI / 5;
    scene.add(arm1);

    const arm2 = new THREE.Mesh(armGeom, armMat);
    arm2.position.set(1.3, 0, 0);
    arm2.rotation.z = -Math.PI / 5;
    scene.add(arm2);

    // Character 3: Blue cone
    const hatGeom = new THREE.ConeGeometry(0.7, 1.3, 32);
    const hatMat = new THREE.MeshStandardMaterial({ color: 0x00a8ff, emissive: 0x0077cc });
    const hat = new THREE.Mesh(hatGeom, hatMat);
    hat.position.set(2, 1.5, 0);
    scene.add(hat);
    objects.push(hat);

    // Base
    const baseGeom = new THREE.CylinderGeometry(0.85, 0.85, 0.8, 32);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xff4081, emissive: 0xff0060 });
    const base = new THREE.Mesh(baseGeom, baseMat);
    base.position.set(2, -0.5, 0);
    scene.add(base);
    objects.push(base);

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);

      // Rotate all objects
      objects.forEach((obj, index) => {
        obj.rotation.x += 0.008 * (index + 1);
        obj.rotation.y += 0.012 * (index + 1);
      });

      // Bobbing motion
      objects.forEach((obj, index) => {
        const bob = Math.sin(Date.now() * 0.001 + index) * 0.3;
        if (index === 0) obj.position.y = 1 + bob;
        else if (index === 1) obj.position.y = 0 + bob;
        else if (index === 2) obj.position.y = 1.5 + bob;
        else if (index === 3) obj.position.y = -0.5 + bob;
      });

      // Animate pupils
      const time = Date.now() * 0.001;
      pupil1.position.x = -2.4 + Math.sin(time) * 0.15;
      pupil1.position.y = 1.3 + Math.cos(time) * 0.15;

      pupil2.position.x = -1.6 + Math.sin(time) * 0.15;
      pupil2.position.y = 1.3 + Math.cos(time) * 0.15;

      renderer.render(scene, camera);
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      const newWidth = window.innerWidth;
      const newHeight = window.innerHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      renderer.dispose();
      if (containerRef.current && renderer.domElement.parentNode === containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [isActive]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-0 pointer-events-none"
      style={{
        opacity: isActive ? 1 : 0,
        transition: 'opacity 0.3s ease',
        visibility: isActive ? 'visible' : 'hidden',
      }}
    />
  );
}
