"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export function CameraControls() {
  const { camera, gl } = useThree();
  const controls = useMemo(() => new OrbitControls(camera, gl.domElement), [camera, gl.domElement]);

  useEffect(() => {
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 3.2;
    controls.maxDistance = 8.5;
    controls.target.set(0, 0, 0);

    return () => {
      controls.dispose();
    };
  }, [controls]);

  useFrame(() => {
    controls.update();
  });

  return null;
}
