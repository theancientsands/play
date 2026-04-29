	import * as THREE from 'three';
	import { textureLoader } from './textureloader.js'; //so we can load textures from any file
	 
	export function createLavaMaterial() {	
		// --- SHADER LAVA (KEPT IN) ---
		const lavaTex = textureLoader.load('./media/2.bmp');
		const noiseTex = textureLoader.load('https://threejs.org/examples/textures/disturb.jpg'); 
		lavaTex.wrapS = lavaTex.wrapT = THREE.RepeatWrapping;
		noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
	
	
        return new THREE.ShaderMaterial({		
            uniforms: {
                uTime: { value: 0 },
                uLavaTexture: { value: lavaTex },
                uNoiseTexture: { value: noiseTex },
                uEmissiveColor: { value: new THREE.Color(0xff3300) }
            },
            vertexShader: `
                uniform float uTime;
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    vec3 pos = position;
                    float wave = sin(pos.x * 0.3 + uTime * 1.5) * 0.4;
                    float ripple = cos(pos.y * 0.4 + uTime * 1.2) * 0.2;
                    pos.z += wave + ripple;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                }
            `,
           fragmentShader: `
			uniform float uTime;
			uniform sampler2D uLavaTexture;
			uniform sampler2D uNoiseTexture;
			uniform vec3 uEmissiveColor;
			varying vec2 vUv;

			// Convert sRGB colors to Linear space for the Composer
			vec3 sRGBToLinear(vec3 color) {
				return pow(color, vec3(2.2));
			}

			void main() {
				vec2 noiseUv = vUv * 1.5;
				noiseUv.y -= uTime * 0.1;
				vec4 noise = texture2D(uNoiseTexture, noiseUv);

				vec2 distUv = vUv;
				distUv.x += (noise.r - 0.5) * 0.05;
				distUv.y += (noise.g - 0.5) * 0.05 + uTime * 0.01;

				// 1. Get the texture color
				vec4 texColor = texture2D(uLavaTexture, distUv);
				
				// 2. Convert textures and uniforms to Linear space
				// This stops the lava from looking washed out/neon
				vec3 linearTex = sRGBToLinear(texColor.rgb);
				vec3 linearEmissive = sRGBToLinear(uEmissiveColor);

				float glow = 0.4 + sin(uTime * 0.8) * 0.15;

				// 3. Combine in Linear space
				vec3 finalColor = linearTex + (linearEmissive * glow * linearTex.r);

				gl_FragColor = vec4(finalColor, 1.0);
			}
		`
        });
	}