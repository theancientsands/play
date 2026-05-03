		import Stats from './three/examples/jsm/libs/stats.module.js';
	
		const stats = new Stats();
		stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
		document.body.appendChild(stats.dom);

		// --- MAKE IT BIGGER ---
		stats.dom.style.position = 'absolute';
		stats.dom.style.top = '10px';
		stats.dom.style.left = '10px';
		stats.dom.style.transform = 'scale(2.0)'; // Double the size
		stats.dom.style.transformOrigin = 'top left'; // Keep it pinned to the corner
	
        import * as THREE from 'three';
       // Tools & Loaders
		import { GLTFLoader } from './three/examples/jsm/loaders/GLTFLoader.js';
		import { OrbitControls } from './three/examples/jsm/controls/OrbitControls.js';

		// Post-Processing (Now pulled from your local files)
		import { EffectComposer } from './three/examples/jsm/postprocessing/EffectComposer.js';
		import { RenderPass } from './three/examples/jsm/postprocessing/RenderPass.js';
		import { ShaderPass } from './three/examples/jsm/postprocessing/ShaderPass.js';
		import { OutlinePass } from './three/examples/jsm/postprocessing/OutlinePass.js';
		import { OutputPass } from './three/examples/jsm/postprocessing/OutputPass.js';
		
		//textureLoader
		import { textureLoader } from './textureloader.js'; //so we can load textures from any file
		
		//entity.js
		import { loadEntity, spawnEntity, respawnEntity } from './entity.js';
		
		//lava.js
		import { createLavaMaterial } from './lava.js';
		
		//reflector.js
		import { Reflector } from './three/examples/jsm/objects/Reflector.js';

        export const scene = new THREE.Scene();
        const clock = new THREE.Timer();
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

		let renderer = new THREE.WebGLRenderer({ 
			antialias: true, 
			powerPreference: "high-performance",
			//logarithmicDepthBuffer: true // <--- Add this line
		});
		
		// Instead of window.innerWidth, cap the resolution for better performance
		const width = window.innerWidth;
		const height = window.innerHeight;
		const pixelRatio = window.devicePixelRatio; // Cap at 1.5 even on 4K screens
		renderer.setPixelRatio(pixelRatio);
		renderer.setSize(width, height);
        renderer.outputColorSpace = THREE.SRGBColorSpace; 
		
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.BasicShadowMap;

        document.body.appendChild(renderer.domElement);

        const aspect = window.innerWidth / window.innerHeight;
        const d = 10; 
        const camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 0.1, 2000);
        
		camera.zoom = 0.6; // Higher = zoomed in more, Lower (e.g. 0.5) = zoomed out further
		
		camera.position.set(100, 100, 100); 
        camera.lookAt(0, 0, 0);
        const cameraOffset = new THREE.Vector3().copy(camera.position);
		
		// 1. Initialize Composer
		export const composer = new EffectComposer(renderer);

		// 2. Base Render Pass
		const renderPass = new RenderPass(scene, camera);
		composer.addPass(renderPass);

		// 3. Outline Pass
		const outlinePass = new OutlinePass(
			new THREE.Vector2(window.innerWidth, window.innerHeight), 
			scene, 
			camera
		);
		
		outlinePass.edgeStrength = 4.0;
		outlinePass.edgeThickness = 1.5;
		outlinePass.visibleEdgeColor.set('#ff0000'); // Red selection
		outlinePass.hiddenEdgeColor.set('#220000');  // Darker red for obscured parts
		composer.addPass(outlinePass);

		// 4. THE COLOR FIX (OutputPass)
		// This is the mandatory final step that fixes the SRGB/Gamma issue.
		const outputPass = new OutputPass();
		composer.addPass(outputPass);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableRotate = false; 
        controls.enableZoom = true;    
        controls.enablePan = false; 
		
		// 1. Force the controls to look where the camera is currently looking
		controls.target.copy(new THREE.Vector3(0, 0, 0)); // Match your camera.lookAt(0,0,0)

		// 2. Ensure the internal matrix is updated before the first scroll
		camera.updateProjectionMatrix();
		
		// --- ADD THESE TWO LINES ---
		controls.update();  // Syncs the internal state with your camera.position/zoom
		controls.saveState(); // Tells the controls "this is the starting point"

        scene.add(new THREE.AmbientLight(0xffffff, 0.01)); 
        const sun = new THREE.DirectionalLight(0xffffff, 0.01);
        sun.position.set(50, 100, 50);
		sun.castShadow = true;
        scene.add(sun);

        let dwarf, mixer, fireLight, fireParticles, water, lava, lavaLight, waterfallParticles;
        let animations = {}; 
        let currentAction;
		let isMouseDown = false;
		const mouseCoords = new THREE.Vector2(); // To store the "static" mouse position
        let targetPosition = new THREE.Vector3(0, 0, 0);
        const moveSpeed = 15.0;
        const collisionObjects = [];
		let introdone = false;
		
		//Hovered Objects
		let hoveredObject = null;
		
		let skeleton, skeletonMixer;
		let skeletonAnimations = {};
		let skeletonState = 'idle'; // 'idle', 'run', 'attack'
		let isSkeletonDead = false;
		let playerHP = 100, skeletonHP = 100;

		// UI Elements for Health Bars
		const playerHPBar = createHPBar('green');
		const skeletonHPBar = createHPBar('red');
		
		let visualSkeletonHP = 100; 
		const lerpSpeed = 0.1; // Higher = faster slide, Lower = slower "drain"
		
		export function createHPBar(color) {
			const canvas = document.createElement('canvas');
			canvas.width = 256; canvas.height = 32;
			const ctx = canvas.getContext('2d');
			
			const texture = new THREE.CanvasTexture(canvas);
			
			const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
			sprite.scale.set(4, 0.5, 1);
			
			sprite.userData = { ctx, texture, canvas };
			scene.add(sprite);
			return sprite;
		}

		function updateHPBar(sprite, percent, color) {
			const { ctx, texture, canvas } = sprite.userData;
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.fillStyle = '#333';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.fillStyle = color;
			ctx.fillRect(0, 0, canvas.width * (percent / 100), canvas.height);
			texture.needsUpdate = true;
		}

        export const gltfLoader = new GLTFLoader();

        const groundTex = textureLoader.load('./media/42.bmp');
		
		const groundNormal = textureLoader.load('./media/42_n.png'); // Replace with your actual normal map file
		
        groundTex.colorSpace = THREE.SRGBColorSpace; 
		
        // 1. Switch to Standard Material
		const groundMat = new THREE.MeshStandardMaterial({ 
			map: groundTex,
			normalMap: groundNormal 
		});

		// 2. Increase the strength (Default is 1, 1)
		// Try (2, 2) for a stronger look, or even higher for deep ridges
		groundMat.normalScale.set(3, 3); 

		const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), groundMat);
        ground.rotation.x = -Math.PI / 2;
		ground.receiveShadow = true; // <--- ADD THIS
        scene.add(ground);
		
		const createDissolveMask = () => {
			const canvas = document.createElement('canvas');
			canvas.width = 256;
			canvas.height = 256;
			const ctx = canvas.getContext('2d');

			const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
			gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');   // Center: Fully Opaque
			gradient.addColorStop(0.7, 'rgba(255, 255, 255, 1)'); // Stay solid most of the way
			gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');   // Edge: Fully Dissolved

			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, 256, 256);
			
			const texture = new THREE.CanvasTexture(canvas);
			return texture;
		};

        /*const waterNormals = textureLoader.load('https://threejs.org/examples/textures/waternormals.jpg');
        waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;
		const waterMat = new THREE.MeshPhongMaterial({
			color: 0x002244,    // Darker base color for more contrast
			specular: 0x888888, // Grey instead of pure white prevents "blown out" spots
			shininess: 40,     // Much higher shininess makes the glints sharper/smaller
			transparent: true,
			opacity: 0.4,
			normalMap: waterNormals,
			normalScale: new THREE.Vector2(0.5, 0.5), // Lower this slightly for more realism
			blending: THREE.NormalBlending,
			depthWrite: false
		});
		
        water = new THREE.Mesh(new THREE.CircleGeometry(15, 64), waterMat);
        water.rotation.x = -Math.PI / 2;
        water.position.set(5, 1.2, 5); 
		water.castShadow = false;
		water.receiveShadow = false;
		water.frustumCulled = false;
		water.matrixAutoUpdate = false;
		water.updateMatrix(); // Calculate it once, then never again
        scene.add(water);*/
		
		const geometry = new THREE.CircleGeometry(40, 64);
		
		const customShader = { ...Reflector.ReflectorShader };
		
				const waterTexture = textureLoader.load('./media/water2.png');
		waterTexture.wrapS = waterTexture.wrapT = THREE.RepeatWrapping;

		// 4. Load and setup the DuDv Map[cite: 1]
		const dudvMap = textureLoader.load('./media/dudv.jpg');
		dudvMap.wrapS = dudvMap.wrapT = THREE.RepeatWrapping;

// 2. Assign the vertex and fragment strings (from your previous screenshots)
customShader.vertexShader = `
  uniform mat4 textureMatrix;
varying vec4 vUvRefraction;
varying vec2 vUv;
varying vec3 vWorldPosition;

void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
    vWorldPosition = worldPosition.xyz;
    vUvRefraction = textureMatrix * vec4( position, 1.0 );
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

// 4. Update the Fragment Shader to include lighting
customShader.fragmentShader = `
uniform vec3 color;
uniform sampler2D tDiffuse;
uniform sampler2D tDudv;
uniform sampler2D tWater;
uniform float time;
uniform float opacity;

// Manual light uniforms
uniform vec3 uLightPos;
uniform vec3 uLightColor;
uniform float uLightRadius;
uniform float uLightIntensity;

// Edge fade uniforms
uniform vec3 uCenter;
uniform float uMaxRadius;
uniform float uFadeStart;

varying vec2 vUv;
varying vec4 vUvRefraction;
varying vec3 vWorldPosition;

vec3 sRGBToLinear(vec3 col) {
    return pow(col, vec3(2.2));
}

void main() {
    float waveStrength = 0.02;
    float waveSpeed = 0.03;

    vec2 distortedUv = texture2D( tDudv, vec2( vUv.x + time * waveSpeed, vUv.y ) ).rg * waveStrength;
    distortedUv = vUv.xy + vec2( distortedUv.x, distortedUv.y + time * waveSpeed );
    vec2 distortion = ( texture2D( tDudv, distortedUv ).rg * 2.0 - 1.0 ) * waveStrength;

    // --- EDGE FADE CALCULATION ---
    float distFromCenter = distance(vWorldPosition.xz, uCenter.xz);
    float edgeFade = 1.0 - smoothstep(uFadeStart, uMaxRadius, distFromCenter);

    // --- LIGHTING ---
    vec3 ambient = vec3(0.01); 
    float lightDist = distance(vWorldPosition, uLightPos);
    float falloff = clamp(1.0 - (lightDist / uLightRadius), 0.0, 1.0);
    vec3 directLight = uLightColor * (falloff * falloff) * uLightIntensity;
    vec3 lightFactor = ambient + directLight;

    // --- COLORS ---
    vec3 waterTex = sRGBToLinear(texture2D( tWater, vUv + distortion ).rgb);
    vec3 linearColor = sRGBToLinear(color);
    vec3 litWaterBase = waterTex * linearColor * lightFactor;

    // --- REFLECTION ---
    vec4 uv = vUvRefraction;
    uv.xy += distortion;
    vec4 reflectionBase = texture2DProj( tDiffuse, uv );

    // --- FINAL MIX ---
    // We multiply the reflection by edgeFade so it doesn't look like a "hard" cutout 
    // against whatever is behind the transparent water.
    vec3 fadedReflection = reflectionBase.rgb * edgeFade;
    vec3 finalRGB = mix( fadedReflection, litWaterBase, 0.4 );

    // Multiply the global opacity by the edge fade for the final alpha
    gl_FragColor = vec4( finalRGB, opacity * edgeFade );
}
`;



		// 5. Inject the uniform BEFORE constructor[cite: 1]
		//customShader.uniforms.tDudv = { value: dudvMap };
		//customShader.uniforms.time = { value: 0 };
		// 6. Initialize the Reflector[cite: 1]
		const groundMirror = new Reflector(geometry, {
			shader: customShader,
			clipBias: 0,
			textureWidth: window.innerWidth,
			textureHeight: window.innerHeight,
			color: 0xFFFFFF, // Keep base color black to avoid washing out the mix[cite: 1]
		});
		
		
		// Configure Blending & Transparency explicitly on the material
		groundMirror.material.transparent = true;
		//groundMirror.material.blending = THREE.NormalBlending; // Or THREE.NormalBlending
		
		// 5. Inject the DuDv map and time into the material uniforms
		groundMirror.material.uniforms.tWater = { value: waterTexture };
		groundMirror.material.uniforms.tDudv = { value: dudvMap };
		groundMirror.material.uniforms.time = { value: 0 };
		groundMirror.material.uniforms.opacity = { value: 1.0 }; // Control transparency here
		
		// Add these to your existing uniforms
		groundMirror.material.uniforms.uLightPos = { value: new THREE.Vector3(0, 5, 0) };
		groundMirror.material.uniforms.uLightColor = { value: new THREE.Color(0xffffff) };
		groundMirror.material.uniforms.uLightRadius = { value: 30.0 };
		groundMirror.material.uniforms.uLightIntensity = { value: 1.0 };
		
		// Add these to your initialization
		groundMirror.material.uniforms.uCenter = { value: new THREE.Vector3(0, 1, 0) };
		groundMirror.material.uniforms.uMaxRadius = { value: 40.0 };
		groundMirror.material.uniforms.uFadeStart = { value: 30.0 }; // Start fading at 30 units

		groundMirror.position.set(0, 1, 0);
		groundMirror.rotateX(-Math.PI / 2);
		scene.add(groundMirror);

		const lavaMat = createLavaMaterial();
        lava = new THREE.Mesh(new THREE.PlaneGeometry(30, 30, 64, 64), lavaMat);
        lava.rotation.x = -Math.PI / 2;
        lava.position.set(-40, 1.0, -40);
		lava.castShadow = false;
		lava.receiveShadow = false;
		lava.frustumCulled = false;
		lava.matrixAutoUpdate = false;
		lava.updateMatrix(); // Calculate it once, then never again
        scene.add(lava);

        lavaLight = new THREE.PointLight(0xff3300, 30, 100, 1.2);
        lavaLight.position.set(-40, 8, -40);
        scene.add(lavaLight);
		
		//WATERFALL PARTICLES
		
function createWaterfall() {
    const count = 40; 
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count);
    const offsets = new Float32Array(count * 3); 

    for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 15; 
        positions[i * 3 + 1] = Math.random() * 30; 
        positions[i * 3 + 2] = (Math.random() - 0.5) * 5;
        velocities[i] = 0.15 + Math.random() * 0.25;

        offsets[i * 3] = Math.random() - 0.5; 
        offsets[i * 3 + 1] = Math.random();     
        offsets[i * 3 + 2] = Math.random() - 0.5; 
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 1));
    geometry.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 3));

    const waterfallMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uZoom: { value: 1.0 },
            // INCREASED THIS: Start with a much higher base
            uMasterSize: { value: 600.0 } 
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        vertexShader: `
            uniform float uTime;
            uniform float uZoom;
            uniform float uMasterSize;
            attribute float aVelocity;
            attribute vec3 aOffset;

            void main() {
                vec3 pos = position;

                float fallSpan = 30.0;
                float totalFall = uTime * aVelocity * 60.0;
                
                pos.y = 25.0 - mod( (25.0 - pos.y) + totalFall, fallSpan);

                // Use the floor of the fall to keep the X/Z reset stable per drop
                float loopID = floor(((25.0 - position.y) + totalFall) / fallSpan);
                
                // Deterministic "random" spread based on the initial offset
                pos.x = aOffset.x * 15.0; 
                pos.z = aOffset.z * 5.0;

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                
                // --- SIZE FIX ---
                // We multiply the master size by the camera zoom.
                // If they are still too small, increase uMasterSize in the uniforms above.
                gl_PointSize = uMasterSize * uZoom; 
                
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            void main() {
                vec2 uv = gl_PointCoord - 0.5;
                float dist = length(uv);
                if (dist > 0.5) discard;

                // Soft "Cloudy" Bloom Effect
                vec3 white = vec3(1.0, 1.0, 1.0);
                vec3 blue = vec3(0.5, 0.8, 1.0);
                
                // Create a soft falloff
                float alpha = (0.5 - dist) * 2.0; 
                alpha = pow(alpha, 1.5) * 0.3; // Replicating your 0.3 opacity

                gl_FragColor = vec4(mix(blue, white, alpha), alpha);
            }
        `
    });

    const points = new THREE.Points(geometry, waterfallMaterial);
    points.frustumCulled = false;
    return points;
}

		// Add to scene
		waterfallParticles = createWaterfall();
		waterfallParticles.position.set(10, 0, -8);
		waterfallParticles.castShadow = false;
		waterfallParticles.receiveShadow = false;
		waterfallParticles.frustumCulled = false;
		waterfallParticles.matrixAutoUpdate = false;
		waterfallParticles.updateMatrix(); // Calculate it once, then never again
		
		scene.add(waterfallParticles);
		
		// 1. THE VERTEX SHADER (The "Math" that stops the stretching)
		const grassVertexShader = `
			varying vec2 vUv;
			uniform float uTime;
			uniform vec3 uPlayerPosition;
			uniform float uRadius;
			
			void main() {
				vUv = uv;
				
				// Calculate the world position of the root of this blade
				// This keeps the entire blade moving as one solid unit
				vec4 worldRoot = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
				
				// Get the local vertex position WITH its instance rotation/scale applied
				vec4 localPos = instanceMatrix * vec4(position, 1.0);
				
				// --- BEND CALCULATION ---
				vec3 dirToPlayer = worldRoot.xyz - uPlayerPosition;
				float dist = length(vec2(dirToPlayer.x, dirToPlayer.z));
				
				if (dist < uRadius) {
					// How violent the push is (0 to 1)
					float force = pow(1.0 - dist / uRadius, 2.0);
					
					// Push direction in World Space
					vec2 push = normalize(vec2(dirToPlayer.x, dirToPlayer.z)) * force * 2.2;

					// Apply push to the already-rotated blade
					// Multiplying by uv.y ensures the root (bottom) never moves
					localPos.x += push.x * uv.y;
					localPos.z += push.y * uv.y;
					
					// "Step on" logic: Squeeze the Y height slightly as it leans
					localPos.y *= (1.0 - force * 0.6);
				}

				// --- WIND ---
				float sway = sin(uTime * 2.0 + worldRoot.x * 0.5) * 0.12;
				localPos.x += sway * uv.y;

				// Final Projection (Use localPos, NOT position)
				gl_Position = projectionMatrix * modelViewMatrix * localPos;
			}
		`;

		// 2. THE FRAGMENT SHADER (The "Look")
		const grassFragmentShader = `
    varying vec2 vUv;
    
    // Function to convert sRGB to Linear Space
    vec3 sRGBToLinear(vec3 color) {
        return pow(color, vec3(2.2));
    }

    void main() {
        // These are the colors you WANT to see on screen
        vec3 baseColor = sRGBToLinear(vec3(0.02, 0.12, 0.02)); 
        vec3 tipColor = sRGBToLinear(vec3(0.3, 0.6, 0.1));
        
        float edge = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
        vec3 finalColor = mix(baseColor, tipColor, vUv.y) * edge;
        
        gl_FragColor = vec4(finalColor, 1.0);
        
        // If your lava is also bright, apply sRGBToLinear to its colors too.
    }
`;

		// 3. THE MATERIAL (No hardcoded strings here anymore)
		const grassMaterial = new THREE.ShaderMaterial({
			vertexShader: grassVertexShader,
			fragmentShader: grassFragmentShader,
			uniforms: {
				uTime: { value: 0 },
				uPlayerPosition: { value: new THREE.Vector3(0, 0, 0) },
				uRadius: { value: 4.5 } // Adjust this to make the "bubble" around you bigger
			},
			side: THREE.DoubleSide
		});
		
		grassMaterial.transparent = false; // Turn off expensive blending
		grassMaterial.alphaTest = 0.5;      // Pixels are either 100% visible or 0% (discarded)
		grassMaterial.depthWrite = true;   // Allows the GPU to use the depth buffer

		// 4. THE GENERATOR (Ensures the root is actually at 0,0,0)
		function createGrassField(totalBlades, fieldSize, clusterCount) {
			const geometry = new THREE.PlaneGeometry(0.08, 1.2, 1, 4);
			geometry.translate(0, 0.6, 0); // Crucial: Moves the pivot point to the bottom

			const instancedMesh = new THREE.InstancedMesh(geometry, grassMaterial, totalBlades);
			const matrix = new THREE.Matrix4();

			const clusters = [];
			for (let i = 0; i < clusterCount; i++) {
				clusters.push({
					x: (Math.random() - 0.5) * fieldSize,
					z: (Math.random() - 0.5) * fieldSize,
					radius: 2 + Math.random() * 5
				});
			}

			for (let i = 0; i < totalBlades; i++) {
				const cluster = clusters[Math.floor(Math.random() * clusterCount)];
				const angle = Math.random() * Math.PI * 2;
				const dist = Math.random() * cluster.radius;
				const x = cluster.x + Math.cos(angle) * dist;
				const z = cluster.z + Math.sin(angle) * dist;
				
				const scale = 0.5 + Math.random() * 1.0;
				const rotation = Math.random() * Math.PI;

				matrix.makeRotationY(rotation);
				matrix.scale(new THREE.Vector3(scale, scale, scale));
				matrix.setPosition(x, 1.0, z); // 1.0 should be your ground height
				
				instancedMesh.setMatrixAt(i, matrix);
			}

			return instancedMesh;
		}

		// totalBlades, fieldSize, clusterCount
		const grassField = createGrassField(8000, 150, 40); 
		grassField.castShadow = false;
		grassField.receiveShadow = false;
		grassField.matrixAutoUpdate = false;
		grassField.frustumCulled = false;
		grassField.updateMatrix(); // Calculate it once, then never again
		scene.add(grassField);

        const cpBase = './media/campfire/';
        const campfireTextures = {
            terra: { map: textureLoader.load(cpBase + 'Bonfire black terra txtr.png'), normal: textureLoader.load(cpBase + 'Bonfire black terra normal.png') },
            logs: { map: textureLoader.load(cpBase + 'bonfire logs txtr.png'), normal: textureLoader.load(cpBase + 'bonfire logs normal.png') },
            stones: { map: textureLoader.load(cpBase + 'stone of bonfire txtr.png'), normal: textureLoader.load(cpBase + 'stone of bonfire normal.png') }
        };

        Object.values(campfireTextures).forEach(t => {
            t.map.colorSpace = THREE.SRGBColorSpace;
            t.map.flipY = false; t.normal.flipY = false;
        });

function createFireParticles() {
    const count = 550;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count);
    const offsets = new Float32Array(count); 

    for (let i = 0; i < count; i++) {
        // MATCHING ORIGINAL POSITIONS
        positions[i * 3] = 5 + (Math.random() - 0.5) * 2.5; 
        positions[i * 3 + 1] = 1 + Math.random() * 8; 
        positions[i * 3 + 2] = 5 + (Math.random() - 0.5) * 2.5;

        // MATCHING ORIGINAL VELOCITY
        velocities[i] = 0.05 + Math.random() * 0.08;
        offsets[i] = i; 
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 1));
    geometry.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 1));

    const fireShaderMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uSize: { value: 30.0 }, // Your original size
            uZoom: { value: 1.0 }   // Feed camera.zoom into here
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        vertexShader: `
            uniform float uTime;
            uniform float uSize;
            uniform float uZoom;
            attribute float aVelocity;
            attribute float aOffset;
            varying float vHeightFactor;

            void main() {
                vec3 pos = position;

                // Move upward and loop (Simulating 60fps movement)
                float totalMove = uTime * aVelocity * 60.0; 
                pos.y = 1.5 + mod(pos.y - 1.5 + totalMove, 9.5);

                // Side-to-side jitter
                pos.x += sin(uTime * 3.0 + aOffset) * 0.05;

                vHeightFactor = clamp((pos.y - 1.5) / 7.5, 0.0, 1.0);

                // --- THE CRITICAL FIX ---
                // We multiply size by zoom to match the Orthographic Camera's scaling
                gl_PointSize = uSize * uZoom; 
                
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
        fragmentShader: `
            varying float vHeightFactor;
            
            void main() {
                // Math-based teardrop shape (replaces your canvas drawing)
                vec2 uv = gl_PointCoord - 0.5;
                float dist = length(vec2(uv.x * 1.5, uv.y + uv.x * uv.x * 2.0));
                if (dist > 0.5) discard;

                // Original Color Transitions
                vec3 color;
                if (vHeightFactor < 0.3) {
                    color = vec3(1.0, 1.0, 0.5); 
                } else if (vHeightFactor < 0.7) {
                    color = vec3(1.0, 0.5, 0.0); 
                } else {
                    color = vec3(0.6, 0.1, 0.0); 
                }

                float alpha = smoothstep(0.5, 0.2, dist);
                gl_FragColor = vec4(color, alpha * (1.0 - vHeightFactor));
            }
        `
    });

    return new THREE.Points(geometry, fireShaderMaterial);
}

        gltfLoader.load('./media/campfire.glb', (gltf) => {
            const campfire = gltf.scene;
            campfire.position.set(5, 1, 5); campfire.scale.set(10, 5, 10);
            collisionObjects.push({ pos: new THREE.Vector3(5, 0, 5), radius: 3.5 });
            campfire.traverse(n => {
                if(n.isMesh) {
                    const name = n.name.toLowerCase();
                    let targetTex = (name === 'bonfire_1') ? campfireTextures.logs : 
                                    (name === 'bonfire_2') ? campfireTextures.stones : 
                                    (name === 'bonfire_3') ? campfireTextures.terra : null;
                    if(targetTex) n.material = new THREE.MeshStandardMaterial({ map: targetTex.map, normalMap: targetTex.normal, roughness: 0.9 });
                }
            });
            scene.add(campfire);
            fireLight = new THREE.PointLight(0xff6600, 35, 80, 1.2);
            fireLight.position.set(5, 5, 5); scene.add(fireLight);
            fireParticles = createFireParticles(); 
			fireParticles.castShadow = false;
			fireParticles.receiveShadow = false;
			fireParticles.frustumCulled = false;
			fireParticles.matrixAutoUpdate = false;
			fireParticles.updateMatrix(); // Calculate it once, then never again
		
			scene.add(fireParticles);
        });

        const skinTex = textureLoader.load('./media/knight/material1.png');
        skinTex.flipY = false; skinTex.colorSpace = THREE.SRGBColorSpace;
		
		const armorTex = textureLoader.load('./media/knight/material2.png');
        armorTex.flipY = false; armorTex.colorSpace = THREE.SRGBColorSpace;

        function fadeTo(name) {
          const nextAction = animations[name]; // The animation we want to play
    
			// 1. Exit if the animation doesn't exist
			if (!nextAction) return;

			// 2. Exit if we are already playing this animation
			if (currentAction === nextAction) return;

			// 3. Transition
			if (currentAction) {
				currentAction.fadeOut(0.2);
			}

			nextAction.reset().fadeIn(0.2).play();
			currentAction = nextAction; // Update the global tracker
        }
		
	   const helmTex = textureLoader.load('./media/knight/Image_0.png');
	   helmTex.colorSpace = THREE.SRGBColorSpace;
	   helmTex.needsUpdate = true;
	   helmTex.flipY = false;
	   
	   //FLIP Y NEEDS TO BE TURNED OFF FOR TEXTURES!! By default, Three.js flips textures on the Y-axis when loading them.

        gltfLoader.load('./media/knight/idle.glb', (idleGltf) => {
			dwarf = idleGltf.scene;
			dwarf.scale.set(7, 7, 7);
			
			// This part is the "Engine" for your character's look
			dwarf.traverse(n => { 
				if(n.isMesh) { 
					// 1. Apply the texture
//					n.material = new THREE.MeshToonMaterial({ map: skinTex }); 

					const name = n.name.toLowerCase();
					console.log(name);			  
					
					const skinMaterial = new THREE.MeshToonMaterial({ map: skinTex });
					const armorMaterial = new THREE.MeshToonMaterial({ map: armorTex });

					// Apply them as an array
					if (name == "geometry_0_1")
					n.material = skinMaterial;
					if (name == "geometry_0_2")
						n.material = armorMaterial;
					//n.material[1] = armorMaterial;
					
					// 2. Enable the shadows on the model itself
					n.castShadow = true;  
				} 
			});

			//Warning different models require different point light settings (for shadow size)
			const charLight = new THREE.PointLight(0xffffff, 100, 30, 1.1); 
			charLight.position.set(0, 3, 0);

			charLight.castShadow = true; 

			charLight.shadow.bias = -0.0001;     // Much smaller bias now that we are far away
			charLight.shadow.normalBias = 0.02; // Prevents "self-shadowing" on the dwarf's skin
			charLight.shadow.camera.near = 1.0; 
			charLight.shadow.camera.far = 150;   // Vital fix for the clipping
			
			// Tighten the 'view' of the shadow camera
			charLight.shadow.camera.left = -15;
			charLight.shadow.camera.right = 15;
			charLight.shadow.camera.top = 15;
			charLight.shadow.camera.bottom = -15;

			// Update the projection matrix to apply changes
			charLight.shadow.camera.updateProjectionMatrix();

			// If you want it even softer/cleaner
			// Inside your dwarf/charLight setup:
			charLight.shadow.mapSize.width = 2048; // Up from 256
			charLight.shadow.mapSize.height = 2048;
			//charLight.shadow.radius = 1000; // Slight blur radius
			
			dwarf.add(charLight); 
			
			
			scene.add(dwarf);
			
			mixer = new THREE.AnimationMixer(dwarf);
			animations['idle'] = mixer.clipAction(idleGltf.animations[0]);
			currentAction = animations['idle']; 
			currentAction.play();

			// When loading the walking animation, it just grabs the animation data
			// It doesn't need to traverse again because it's being applied to the 'dwarf' object above
			gltfLoader.load('./media/knight/walking.glb', (walkGltf) => { 
				animations['walk'] = mixer.clipAction(walkGltf.animations[0]); 
			});
			
			// ADD THE ATTACK HERE
			gltfLoader.load('./media/knight/attack.glb', (attackGltf) => { 
				const attackAction = mixer.clipAction(attackGltf.animations[0]);
				attackAction.setLoop(THREE.LoopOnce); // Play once per click
				attackAction.clampWhenFinished = false; // Stay on the last frame if needed
				animations['attack'] = attackAction; 
			});
			

       
			
			gltfLoader.load('./media/knight/helmet.glb', (helmGltf) => {
				const helmet = helmGltf.scene;
				
				helmet.traverse(n => { 
					if(n.isMesh) { 
					const name = n.name.toLowerCase();
					console.log(name);	
					const helmMat = new THREE.MeshToonMaterial({ 
						map: helmTex,
						transparent: false,
						opacity: 1.0,
						//emissive: new THREE.Color(0xffffff), // The color of the "glow"
						//emissiveMap: helmTex,                // Use the texture as the glow map
						//emissiveIntensity: 0.3               // 0.3 provides a "fill", 1.0 is full brightness
					});
					if (name === "geometry_0")
					n.material = helmMat;
					n.castShadow = false;
					n.receiveShadow = false;
					//n.material.emissive.setHex(0xffffff);
            
					// Set the brightness
					//n.material.emissiveIntensity = 0.2; 
					
					// Map the texture so the "glow" matches the armor paint
					//n.material.emissiveMap = helmTex;
					}
				});
				
				// 1. Find the Head bone inside the dwarf model
				// Note: Mixamo names often have colons like 'mixamorig:Head'
				const headBone = dwarf.getObjectByName('mixamorigHead');

				if (headBone) {
					// 2. Adjust helmet transform relative to the bone
					// Since the helmet is now a child of the head, (0,0,0) is the center of the head bone
					helmet.scale.set(70, 70, 70); // Adjust scale to fit
					helmet.rotation.set(0, 0, 0); // Adjust orientation if it's facing the wrong way
					helmet.position.set(0, 8, 3); // Adjust height/depth to sit correctly on the head

					// 3. Attach it!
					headBone.add(helmet);
					
					console.log("Helmet attached to head bone.");
				} else {
					console.error("Could not find head bone! Check the name in the console.");
				}
			});
			
			gltfLoader.load('./media/knight/sword.glb', (swordGltf) => {
				const sword = swordGltf.scene;
				
				sword.traverse(n => { 
					if(n.isMesh) { 
					const name = n.name.toLowerCase();
					console.log(name);	
					const helmMat = new THREE.MeshToonMaterial({ 
						map: helmTex,
						transparent: false,
						opacity: 1.0,
						//emissive: new THREE.Color(0xffffff), // The color of the "glow"
						//emissiveMap: helmTex,                // Use the texture as the glow map
						//emissiveIntensity: 0.3               // 0.3 provides a "fill", 1.0 is full brightness
					});
					if (name === "geometry_0")
					//n.material = helmMat;
					n.castShadow = false;
					n.receiveShadow = false;
					//n.material.emissive.setHex(0xffffff);
            
					// Set the brightness
					//n.material.emissiveIntensity = 0.2; 
					
					// Map the texture so the "glow" matches the armor paint
					//n.material.emissiveMap = helmTex;
					}
				});
				
				// 1. Find the Head bone inside the dwarf model
				// Note: Mixamo names often have colons like 'mixamorig:Head'
				const righthandBone = dwarf.getObjectByName('mixamorigRightHand');

				if (righthandBone) {
					// 2. Adjust helmet transform relative to the bone
					// Since the helmet is now a child of the head, (0,0,0) is the center of the head bone
					sword.scale.set(70, 70, 70); // Adjust scale to fit
					sword.rotation.set(-20, 20, 0); // Adjust orientation if it's facing the wrong way
					sword.position.set(2, 12, -22); // Adjust height/depth to sit correctly on the head

					// 3. Attach it!
					righthandBone.add(sword);
					
					console.log("sword attached to right hand bone.");
				} else {
					console.error("Could not find right hand bone! Check the name in the console.");
				}
			});
			
		});
		
		
		
		//skeleton
		
		const skeletonTex = textureLoader.load('./media/skeleton/Image_0.png');
		const skeletonNormal = textureLoader.load('./media/skeleton/Image_n.png');

		skeletonTex.flipY = false;
		skeletonNormal.flipY = false;
		skeletonTex.colorSpace = THREE.SRGBColorSpace;
		
		/*gltfLoader.load('./media/skeleton/idle.glb', (gltf) => {
			skeleton = gltf.scene;
			skeleton.scale.set(7, 7, 7);
			skeleton.position.set(20, 1, 20); 

			skeleton.traverse(n => {
				if (n.isMesh) {
					// Apply the new textures
					n.material = new THREE.MeshStandardMaterial({
						map: skeletonTex,
						normalMap: skeletonNormal,
						roughness: 0.8,
						metalness: 0.2
					});
					
					// Ensure the skeleton also casts shadows like the dwarf
					n.castShadow = true;
					n.receiveShadow = true;
				}
			});
			
			const hitboxGeom = new THREE.BoxGeometry(0.4, 1, 0.4); // Adjust size to fit skeleton
			const hitboxMat = new THREE.MeshBasicMaterial({ visible: false }); // Invisible
			const hitbox = new THREE.Mesh(hitboxGeom, hitboxMat);
			hitbox.name = "Skeleton_Hitbox";
			hitbox.position.y = 0.5; // Center it upward (BECAREFUL BECAUSE HITBOXES CAN GO UNDER THE FLOOR!!
			skeleton.add(hitbox);

			scene.add(skeleton);

			// Existing animation setup...
			skeletonMixer = new THREE.AnimationMixer(skeleton);
			skeletonAnimations['idle'] = skeletonMixer.clipAction(gltf.animations[0]);
			skeletonAnimations['idle'].play();

			// Load additional animations
			gltfLoader.load('./media/skeleton/run.glb', (a) => skeletonAnimations['run'] = skeletonMixer.clipAction(a.animations[0]));
			gltfLoader.load('./media/skeleton/attack.glb', (a) => skeletonAnimations['attack'] = skeletonMixer.clipAction(a.animations[0]));
			
			gltfLoader.load('./media/skeleton/death.glb', (gltf) => {
				const action = skeletonMixer.clipAction(gltf.animations[0]);
				action.setLoop(THREE.LoopOnce);
				action.clampWhenFinished = true; // Essential: Keeps the skeleton lying on the ground
				skeletonAnimations['death'] = action;
			});
		});*/
		
		function fadeEnemy(enemy, name) {
			const data = enemy.userData;
			const newAction = data.actions[name];
			const oldAction = data.currentAction;

			// If the animation we want isn't loaded yet, just exit
			if (!newAction) return;

			// If we are already playing this animation, don't restart it
			if (oldAction === newAction) return;

			// Transition
			if (oldAction) {
				oldAction.fadeOut(0.2);
			}

			newAction.reset().fadeIn(0.2).play();
			data.currentAction = newAction;
		}
		
		export let enemyList = []; // Array to track all active skeletons

function spawnSkeleton(x, y, z) {
    gltfLoader.load('./media/skeleton/idle.glb', (gltf) => {
        const skeleton = gltf.scene;
        skeleton.scale.set(7, 7, 7);
        skeleton.position.set(x, y, z);

        // Apply Textures and Shadows
        skeleton.traverse(n => {
            if (n.isMesh) {
                n.material = new THREE.MeshStandardMaterial({
                    map: skeletonTex,
                    normalMap: skeletonNormal,
                    roughness: 0.8,
                    metalness: 0.2,
					transparent: true, // Required for opacity
                    opacity: 0         // Start invisible
                });
                n.castShadow = true;
               // n.receiveShadow = true;
            }
        });
		
		const hitboxGeom = new THREE.BoxGeometry(0.4, 1, 0.4); // Adjust size to fit skeleton
		const hitboxMat = new THREE.MeshBasicMaterial({ visible: false }); // Invisible
		const hitbox = new THREE.Mesh(hitboxGeom, hitboxMat);
		hitbox.name = "Skeleton_Hitbox";
		hitbox.position.y = 0.5; // Center it upward (BECAREFUL BECAUSE HITBOXES CAN GO UNDER THE FLOOR!!
		skeleton.add(hitbox);

        const skeletonMixer = new THREE.AnimationMixer(skeleton);
        const skeletonActions = {};
		
		let separationVec = new THREE.Vector3(0, 0, 0);
		let diff = new THREE.Vector3(0, 0, 0);
		let dir = new THREE.Vector3(0, 0, 0);
		
					

        // Setup the Data Object
        skeleton.userData = {
            currentHP: 100,
            visualHP: 100,
            isDead: false,
            mixer: skeletonMixer,
            actions: skeletonActions,
            currentAction: null,
            hpBar: createHPBar('red'),
			isSpawning: true, // New flag
            spawnProgress: 0,  // From 0 to 1
			isAttacking: false,
			cachedHitBox: hitbox,
			separationVec: separationVec,
			diff: diff,
			dir: dir
        };

        // 1. Load Idle (Base)
        skeletonActions['idle'] = skeletonMixer.clipAction(gltf.animations[0]);
        skeletonActions['idle'].play();
        skeleton.userData.currentAction = skeletonActions['idle'];

        // 2. Load Run
        gltfLoader.load('./media/skeleton/run.glb', (animGltf) => {
            skeletonActions['run'] = skeletonMixer.clipAction(animGltf.animations[0]);
        });

        // 3. Load Attack
        gltfLoader.load('./media/skeleton/attack.glb', (animGltf) => {
            skeletonActions['attack'] = skeletonMixer.clipAction(animGltf.animations[0]);
        });

        // 4. Load Death
        gltfLoader.load('./media/skeleton/death.glb', (animGltf) => {
            const action = skeletonMixer.clipAction(animGltf.animations[0]);
            action.setLoop(THREE.LoopOnce);
            action.clampWhenFinished = true;
            skeletonActions['death'] = action;
        });
		
		//Turn off frustrum
		skeleton.frustumCulled = false;

        // Add to World
        scene.add(skeleton);
		
		//precompile outline shader on spawn
		addOutline(skeleton);
		composer.render();
		removeOutline(skeleton);
		composer.render();
		
        scene.add(skeleton.userData.hpBar);
        
        // Push to the global list for the animate() loop
        enemyList.push(skeleton);
    });
}



     window.addEventListener('mousedown', (e) => { 
			isMouseDown = true;
			//updateMouseCoords(e);
		});

		window.addEventListener('mouseup', () => { 
			isMouseDown = false; 
		});

		window.addEventListener('mousemove', (e) => {
			updateMouseCoords(e);
		});

		function updateMouseCoords(event) {
			// Get the exact location and size of the game canvas
			const rect = renderer.domElement.getBoundingClientRect();

			// Calculate position relative to the canvas edges
			mouseCoords.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
			mouseCoords.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
		}

        function checkCollision(newPos) {
			// 1. Use a standard for-loop to avoid Iterator allocation
			for (let i = 0; i < collisionObjects.length; i++) {
				const obj = collisionObjects[i];
				
				// 2. Calculate squared distance (dx*dx + dz*dz)
				// This is MUCH faster than Math.sqrt and Math.pow
				const dx = newPos.x - obj.pos.x;
				const dz = newPos.z - obj.pos.z;
				const distanceSquared = (dx * dx) + (dz * dz);
				
				// 3. Compare against the radius squared
				const radiusSquared = obj.radius * obj.radius;
				
				if (distanceSquared < radiusSquared) {
					return true;
				}
			}
			return false;
		}
		
		// Spawn the initial "boss" skeleton
		//spawnSkeleton(20, 0, 20);
		
		// Spawn the initial "boss" skeleton
		//spawnSkeleton(40, 0, 40);
		
		
		// Pre-load at start
		await loadEntity('skeleton');

		// Spawn whenever needed
		spawnEntity('skeleton', 20, 0, 20);
		spawnEntity('skeleton', 40, 0, 40);
		
		//Setup DWARF VARIABLES
		let isAttacking = false;
		let enemyTracked = false;
		let direction = new THREE.Vector3(0, 0, 0);
		let nextStep = new THREE.Vector3(0, 0, 0);
		let lookTarget = new THREE.Vector3(0, 0, 0);
		let firstHit = false;
	
		//Grass VARIABLES
		let lastGrassUpdatePos = new THREE.Vector3();
	
		//Precompile shaders and scene?
		renderer.compile(scene, camera);
		
        function animate() {
		
			stats.begin(); // START TRACKING
		
            requestAnimationFrame(animate);
			
			clock.update();
			
            const delta = clock.getDelta();
            const time = clock.getElapsed();
			
			if (playerHP <= 0)
			{
				playerHP = 100;
				if (dwarf)
				{
					dwarf.position.x = -20;
					dwarf.position.y = 0;
					dwarf.position.z = 0;
					
					// Crucial: sync the targetPosition so he doesn't "snap back" 
					// to a previous click location once you stop hovering
					targetPosition.copy(dwarf.position);
					
					fadeTo('idle');
					
					isMouseDown = false;
					enemyTracked = false;
					
					if (hoveredObject)
					{
					removeOutline(hoveredObject);
					hoveredObject = null;
					}
				}
			}
			
			// --- CONTINUOUS MOUSE TRACKING ---
			if (isMouseDown) {
				raycaster.setFromCamera(mouseCoords, camera);
				const intersects = raycaster.intersectObject(ground);
				if (intersects.length > 0) {
					targetPosition.copy(intersects[0].point);
				}
				
				if (hoveredObject && dwarf && animations['attack'] && !isAttacking && !hoveredObject.userData.isDead) {
				
					const distToEnemy = dwarf.position.distanceTo(hoveredObject.position);
					
					const attackRange = 5.0; // The distance needed to START the attack
					const exitBuffer = 2.0;  // How much further they can move before the attack "breaks"

					// Calculate the "Active Range": 
					// If we are already attacking, the range is effectively 7.0 (5 + 2).
					// If we are just walking up, the range is 5.0.
					const dynamicRange = isAttacking ? (attackRange + exitBuffer) : attackRange;

					if (distToEnemy < dynamicRange) {
					isAttacking = true;
					//fadeTo('idle'); 
					
					// Make the dwarf face the skeleton even while standing still
					const dx = hoveredObject.position.x - dwarf.position.x;
					const dz = hoveredObject.position.z - dwarf.position.z;
					dwarf.rotation.y = Math.atan2(dx, dz);
					// Just trigger the animation. Let the animate loop handle the "Facing"
					animations['attack'].reset().play();
					animations['attack'].setLoop(THREE.LoopOnce);
					//fadeTo('attack');
					
					lookTarget = lookTarget.set(hoveredObject.position.x, dwarf.position.y, hoveredObject.position.z);
					dwarf.lookAt(lookTarget);
					
					let targetObject = hoveredObject;
					
					setTimeout(() => {
						if (targetObject && targetObject.userData.currentHP > 0) {
							targetObject.userData.currentHP -= 20; // Damage amount
						}
					}, 400);
					
					setTimeout(() => {
												isAttacking = false;
					}, 1000);
					}
					else
					{
						targetPosition.copy(hoveredObject.position);
						enemyTracked = true;
					}
				}
			}
			
let foundObject = false;
			
for (let i = 0; i < enemyList.length; i++) {
    const enemy = enemyList[i];
    //const data = enemy.userData;

        const data = enemy.userData;
        if (!data.mixer) continue;
		if (!dwarf) continue;
		if (!introdone) continue;

        // 1. UPDATE THE MIXER (The heartbeat of the animation)
        data.mixer.update(delta);
		
		//SPAWN FADE IN
		if (data.isSpawning) {
        data.spawnProgress += 0.01; // Adjust speed here (0.01 = ~1.6 seconds at 60fps)
        
        enemy.traverse(n => {
            if (n.isMesh) {
                n.material.opacity = data.spawnProgress;
            }
        });

        if (data.spawnProgress >= 1) {
            data.isSpawning = false;
            data.hpBar.visible = true; // Show HP bar only when fully spawned
        }
    }

        // 2. DISTANCE & SEPARATION (Prevents walking into each other)
		const distToPlayer = enemy.position.distanceTo(dwarf.position);

		if (!data.isDead && !data.isSpawning) {
			data.separationVec = data.separationVec.set(0, 0, 0);
			const personalSpace = 4.0; 

			// Replace the entire enemyList.forEach block with this:
			for (let j = 0; j < enemyList.length; j++) {
				const otherEnemy = enemyList[j];
				
				// 1. Skip if it's the same enemy (replaces 'return')
				if (enemy === otherEnemy) continue; 
				
				// 2. Optimization: use distanceToSquared to avoid the expensive Square Root math
				let distToOther = enemy.position.distanceTo(otherEnemy.position);
				
				// 3. Use the otherEnemy's userData to check if they are dead
				if (otherEnemy.userData && !otherEnemy.userData.isDead && distToOther < personalSpace) {
					// We reuse the 'diff' vector already stored in userData to avoid 'new' allocations
					data.diff.subVectors(enemy.position, otherEnemy.position);
					
					// --- FIX STARTS HERE ---
					if (distToOther === 0) {
						// If they are exactly on top of each other, 
						// give them a random nudge so the math works next frame.
						data.diff.set(Math.random() - 0.5, 0, Math.random() - 0.5);
						distToOther = 0.1; // Pretend they are slightly apart
					}
					
					data.diff.normalize().divideScalar(distToOther); 
					data.separationVec.add(data.diff);
				}
			}
			
			// --- THE FIX: ZERO OUT THE VERTICAL AXIS ---
			data.separationVec.y = 0;
			
			// Apply the push so they slide apart
			enemy.position.addScaledVector(data.separationVec, 0.1);
		}
		
		if (data.currentHP <= 0 && !data.isDead) {
			
			// 1. Hard stop the attack immediately
			//animations['attack'].stop();
			// 2. Reset the walk animation to frame 0
			// 3. Set weight to 1 (full influence) 
			// 4. Play it
			//animations['walk'].reset().fadeIn(0.1).play();
			
			if (hoveredObject === enemy)
			{
				removeOutline(hoveredObject);
				hoveredObject = null;
			}
			
			data.isDead = true;
			// 2. Hide the HP Bar immediately
			data.hpBar.visible = false;

			// 3. Wait for the animation to finish (e.g., 2 seconds) then fade out
			setTimeout(() => {
				fadeAndRemove(enemy);
				//spawnSkeleton(20, 0, 20);
			
			}, 2500); 
		}

        // --- AI LOGIC & ANIMATION SWITCHING with HYSTERESIS ---

// Define your thresholds
const attackRange = 5.0;
const chaseRange = 25.0;
const buffer = 1.5; // The "Sticky" factor

if (data.isDead) {
    if (data.actions['death']) fadeEnemy(enemy, 'death');
} 
// 1. ATTACK STATE (Entry at 5, Exit at 6.5)
else if (!data.isSpawning && distToPlayer < (data.currentAction === data.actions['attack'] ? attackRange + buffer : attackRange)) {

    if (data.actions['attack']) fadeEnemy(enemy, 'attack');
    enemy.lookAt(dwarf.position.x, enemy.position.y, dwarf.position.z);
	
	if (!data.isAttacking) {
        data.isAttacking = true;

        setTimeout(() => {
            // Check if still alive and still in range when the hit actually lands
            const currentDist = enemy.position.distanceTo(dwarf.position);
            if (!data.isDead && currentDist < attackRange + 1) {
                playerHP -= 20;
                console.log("Player Hit! HP:", playerHP);
                // Trigger any player "hit" effects here (like red flash)
            }
        }, 500); // 700ms is the "impact" point of the animation

        // Cooldown: Skeleton can only swing every 1.5 seconds
        setTimeout(() => {
            data.isAttacking = false;
        }, 2500); 
    }
} 
// 2. CHASE STATE (Entry at 25, Exit at 26.5)
else if (!data.isSpawning && distToPlayer < (data.currentAction === data.actions['run'] ? chaseRange + buffer : chaseRange)) {

    if (data.actions['run']) {
        fadeEnemy(enemy, 'run');
        data.dir = data.dir.subVectors(dwarf.position, enemy.position).normalize();
		data.dir.y = 0;
        enemy.position.addScaledVector(data.dir, 0.12); 
    }
    enemy.lookAt(dwarf.position.x, enemy.position.y, dwarf.position.z);
} 
// 3. IDLE STATE
else {
    fadeEnemy(enemy, 'idle');
}
		
		//if (enemy.currentHP < 0) enemy.currentHP = 0;	

        // 4. HP BAR POSITIONING
        if (data.hpBar) {
            data.hpBar.position.set(enemy.position.x, enemy.position.y + 8, enemy.position.z);
			
			if (Math.abs(data.visualHP - data.currentHP) > 0.1) {
			data.visualHP += (data.currentHP - data.visualHP) * lerpSpeed;
			}
			
			updateHPBar(data.hpBar, data.visualHP, 'red');
        }
		
		//HOVERING ENEMIES
		
		raycaster.setFromCamera(mouseCoords, camera);
				
		// Check for the hitbox specifically
		const hitbox = data.cachedHitBox;
		const intersects = raycaster.intersectObject(hitbox); // No need for 'true' here

		if (!data.isDead && intersects.length > 0) {
		
			if (hoveredObject !== null && hoveredObject !== enemy)
			{
			removeOutline(hoveredObject);
			hoveredObject = null;
			}
		
			foundObject = true;
			hoveredObject = enemy;
			addOutline(enemy, 2);
			//console.log("--- SKELETON TARGETED ---");
		}
    }
	
	//dont keep releasing the lock when mouse held
	if (!foundObject && !isMouseDown && !enemyTracked)
	{
			if (hoveredObject !== null) {
				removeOutline(hoveredObject);
				hoveredObject = null;
				console.log("--- TARGET LOST ---");
			}
	}
			
			//Hovering Objects
			
			/*if (skeleton) {
				raycaster.setFromCamera(mouseCoords, camera);
				
				// Check for the hitbox specifically
				const hitbox = skeleton.getObjectByName("Skeleton_Hitbox");
				const intersects = raycaster.intersectObject(hitbox); // No need for 'true' here

				if (intersects.length > 0) {
					if (hoveredObject === null) {
						hoveredObject = skeleton;
						addOutline(skeleton, 2);
						console.log("--- SKELETON TARGETED ---");
					}
				} else {
					if (hoveredObject !== null) {
						removeOutline(hoveredObject);
						hoveredObject = null;
						console.log("--- TARGET LOST ---");
					}
				}
			}*/

            if (water) {
                water.material.normalMap.offset.x = time * 0.05;
                water.material.normalMap.offset.y = time * 0.05;
            }
			
			if (groundMirror && dwarf) 
			{
				groundMirror.material.uniforms.time.value = time;
				groundMirror.material.uniforms.uLightPos.value.copy(dwarf.position);
			}

          if (lava) lava.material.uniforms.uTime.value = time;
            //hazePass.uniforms.uTime.value = time;

			// Inside your animate() loop:
			if (grassMaterial && dwarf) {
				grassMaterial.uniforms.uTime.value = time;
				
				// Only update the "Trample" position if the dwarf has moved more than 0.1 units
				if (dwarf.position.distanceToSquared(lastGrassUpdatePos) > 0.01) {
					grassField.material.uniforms.uPlayerPosition.value.set(
						dwarf.position.x, 
						dwarf.position.y, 
						dwarf.position.z
					);
					lastGrassUpdatePos.copy(dwarf.position);
				}
			}

		// Inside animate()
		if (fireParticles) {
				fireParticles.material.uniforms.uTime.value = time;
				// This keeps the fire scaling perfectly with your world zoom
				fireParticles.material.uniforms.uZoom.value = camera.zoom;
			}
			
			// --- GPU WATERFALL UPDATE ---
			if (waterfallParticles) {
				waterfallParticles.material.uniforms.uTime.value = time;
				waterfallParticles.material.uniforms.uZoom.value = camera.zoom;
			}

	//DWARF UPDATE LOOP
	if (dwarf && mixer) 
	{
    mixer.update(delta);
    const distance = dwarf.position.distanceTo(targetPosition);

	setInterval(() => {
    const waterfalldistance = dwarf.position.distanceTo(waterfallParticles.position);

    if (waterfalldistance < 15) {
        if (playerHP < 100) {
            playerHP += 1;
            // Update your UI here if needed
        }
    }
}, 3000); // 1000ms = 1 second

	if (distance > 0.1) {
	
    if (hoveredObject) {
	
		const distance = dwarf.position.distanceTo(hoveredObject.position);
		
		const attackRange = 5.0; // The distance needed to START the attack
		const exitBuffer = 2.0;  // How much further they can move before the attack "breaks"

		// Calculate the "Active Range": 
		// If we are already attacking, the range is effectively 7.0 (5 + 2).
		// If we are just walking up, the range is 5.0.
		const dynamicRange = isAttacking ? (attackRange + exitBuffer) : attackRange;

		if (enemyTracked && distance > dynamicRange) {
			//keep updating the hovered object position
			targetPosition.copy(hoveredObject.position);
		
			direction = direction.subVectors(targetPosition, dwarf.position).normalize();
			
			// --- THE FIX: Multiply moveSpeed by delta ---
			// This ensures the distance moved is consistent regardless of FPS
			const actualMoveSpeed = moveSpeed * delta; 
			nextStep = nextStep.copy(dwarf.position).addScaledVector(direction, actualMoveSpeed);
			
			if (!checkCollision(nextStep)) {
				fadeTo('walk'); 
				dwarf.position.copy(nextStep);
				lookTarget = lookTarget.set(targetPosition.x, dwarf.position.y, targetPosition.z);
				dwarf.lookAt(lookTarget);
			} else {
				fadeTo('idle');
				removeOutline(hoveredObject);
				hoveredObject = null;
			}
		}
		else
		{
			if (enemyTracked && !firstHit)
			{
				if (hoveredObject && dwarf && animations['attack'] && !isAttacking && !hoveredObject.userData.isDead) {
						animations['walk'].reset().stop();
						const distToEnemy = dwarf.position.distanceTo(hoveredObject.position);
						
						const attackRange = 5.0; // The distance needed to START the attack
						const exitBuffer = 2.0;  // How much further they can move before the attack "breaks"

						// Calculate the "Active Range": 
						// If we are already attacking, the range is effectively 7.0 (5 + 2).
						// If we are just walking up, the range is 5.0.
						const dynamicRange = isAttacking ? (attackRange + exitBuffer) : attackRange;

						if (distToEnemy < dynamicRange) {
						isAttacking = true;
						//fadeTo('idle'); 
						
						// Make the dwarf face the skeleton even while standing still
						const dx = hoveredObject.position.x - dwarf.position.x;
						const dz = hoveredObject.position.z - dwarf.position.z;
						dwarf.rotation.y = Math.atan2(dx, dz);
						// Just trigger the animation. Let the animate loop handle the "Facing"
						animations['attack'].reset().play();
						animations['attack'].setLoop(THREE.LoopOnce);
						//fadeTo('attack');
						
						lookTarget = lookTarget.set(hoveredObject.position.x, dwarf.position.y, hoveredObject.position.z);
						dwarf.lookAt(lookTarget);
						
						let targetObject = hoveredObject;
						
						setTimeout(() => {
							if (targetObject && targetObject.userData.currentHP > 0) {
								targetObject.userData.currentHP -= 20; // Damage amount
							}
						}, 400);
						
						setTimeout(() => {
													isAttacking = false;
						}, 1000);
						}
						else
						{
							targetPosition.copy(hoveredObject.position);
							enemyTracked = true;
						}
				}
				firstHit = true;
			}
			else
			{
			fadeTo('idle'); 
			
			//lookTarget = lookTarget.set(hoveredObject.position.x, dwarf.position.y, hoveredObject.position.z);
			//dwarf.lookAt(lookTarget);
			targetPosition.copy(dwarf.position);
			enemyTracked = false;
			}
        }
    } 
	else if (distance > 1.0) {
		firstHit = false;
		animations['attack'].stop();
        direction = direction.subVectors(targetPosition, dwarf.position).normalize();
        
        // --- THE FIX: Multiply moveSpeed by delta ---
        // This ensures the distance moved is consistent regardless of FPS
        const actualMoveSpeed = moveSpeed * delta; 
        nextStep = nextStep.copy(dwarf.position).addScaledVector(direction, actualMoveSpeed);
        
        if (!checkCollision(nextStep)) {
            fadeTo('walk'); 
            dwarf.position.copy(nextStep);
			lookTarget = lookTarget.set(targetPosition.x, dwarf.position.y, targetPosition.z);
            dwarf.lookAt(lookTarget);
        } else {
            fadeTo('idle');
        }
    } else {
		firstHit = false;
		animations['attack'].stop();
        fadeTo('idle');
    }
	}
    
    // UI and Camera following
    playerHPBar.position.set(dwarf.position.x, dwarf.position.y + 8, dwarf.position.z);
    updateHPBar(playerHPBar, playerHP, 'green');

    //camera.position.set(dwarf.position.x + cameraOffset.x, dwarf.position.y + cameraOffset.y, dwarf.position.z + cameraOffset.z);
    //controls.target.copy(dwarf.position);
	
	// 1. Calculate where the camera SHOULD be
	const idealX = dwarf.position.x + cameraOffset.x;
	const idealY = dwarf.position.y + cameraOffset.y;
	const idealZ = dwarf.position.z + cameraOffset.z;

	// 2. Use a smoothing weight (0.05 is very smooth, 0.2 is snappy)
	// This decouples the camera from the raw 'delta' jitter
	const weight = 0.1; 

	camera.position.x += (idealX - camera.position.x) * weight;
	camera.position.y += (idealY - camera.position.y) * weight;
	camera.position.z += (idealZ - camera.position.z) * weight;

	// 3. Keep the orbit controls centered on the dwarf
	controls.target.lerp(dwarf.position, weight);
	controls.update();
}
			
			
			//skeleton animation
				/*if (skeleton && skeletonMixer) {
					skeletonMixer.update(delta);
					const distToPlayer = skeleton.position.distanceTo(dwarf.position);

					// --- ENEMY AI LOGIC ---
					if (isSkeletonDead)
					{
						if (skeletonState !== 'death') {
							
							fadeSkeletonTo('death');
							skeletonState = 'death';
							}
					}
					else if (distToPlayer < 5) {
						// ATTACK
						if (skeletonState !== 'attack') {
							fadeSkeletonTo('attack');
							skeletonState = 'attack';
						}
					} else if (distToPlayer < 25) {
						// CHASE
						skeletonState = 'run';
						fadeSkeletonTo('run');
						const dir = new THREE.Vector3().subVectors(dwarf.position, skeleton.position).normalize();
						skeleton.position.addScaledVector(dir, 0.12); // Slightly slower than player
						skeleton.lookAt(dwarf.position.x, skeleton.position.y, dwarf.position.z);
					} else {
						// IDLE
						fadeSkeletonTo('idle');
						skeletonState = 'idle';
					}

					// --- UPDATE HP BAR POSITIONS ---
					skeletonHPBar.position.set(skeleton.position.x, skeleton.position.y + 8, skeleton.position.z);
					playerHPBar.position.set(dwarf.position.x, dwarf.position.y + 8, dwarf.position.z);
					
					if (Math.abs(visualSkeletonHP - skeletonHP) > 0.1) {
						// Move visual HP 10% of the way toward actual HP every frame
						visualSkeletonHP += (skeletonHP - visualSkeletonHP) * lerpSpeed;
						
						// 3. Redraw the bar with the moving value
						//updateHPBar(skeletonHPBar, visualSkeletonHP, 'red');
					}
					
					updateHPBar(skeletonHPBar, visualSkeletonHP, 'red');
					updateHPBar(playerHPBar, playerHP, 'green');
				}*/

			
			
            controls.update();
            //renderer.render(scene, camera);
			composer.render();
			
			stats.end();
        }
		
        animate();
		
		function fadeAndRemove(object) {
			const duration = 2000; // 2 seconds to fade
			const startTime = Date.now();

			function fade() {
				const elapsed = Date.now() - startTime;
				const progress = elapsed / duration;

				if (progress < 1) {
					// Sink the skeleton into the floor slightly for a "dissolve" effect
					object.position.y -= 0.01;
					
					// Fade the opacity of all meshes in the skeleton
					object.traverse(n => {
						if (n.isMesh) {
							n.material.transparent = true;
							n.material.opacity = 1 - progress;
						}
					});
					requestAnimationFrame(fade);
				} else {
					// Final cleanup
					scene.remove(object);
					console.log(object.name + " removed from scene.");
					respawnEntity(object.name, 20, 0, 20);
				}
			}
			fade();
		}
		
		
export function addOutline(object) {
    // If outlinepass.selectedobjects can't find the object
    if (outlinePass.selectedObjects.indexOf(object) === -1) {
        outlinePass.selectedObjects.push(object);
        
        // Refresh the pass so the outline actually appears
        //outlinePass.selectedObjects = outlinePass.selectedObjects;
    }
}

export function removeOutline(object) {
    // Iterate the selectedobjects to find and remove the object
    for (let i = 0; i < outlinePass.selectedObjects.length; i++) {
        if (outlinePass.selectedObjects[i] === object) {
            outlinePass.selectedObjects.splice(i, 1);
            
            // Refresh the pass so the outline disappears
            outlinePass.selectedObjects = outlinePass.selectedObjects;
            break; 
        }
    }
}
		
		/*function fadeSkeletonTo(name) {
				const action = skeletonAnimations[name];
				if (action && !action.isRunning()) {
					Object.values(skeletonAnimations).forEach(a => a.fadeOut(0.2));
					action.reset().fadeIn(0.2).play();
				}
			}*/

		// --- INTRO SEQUENCE FOR THE ANCIENT SANDS ---
		function runIntro() {
			const overlay = document.getElementById('intro-overlay');
			const container = document.querySelector('.logo-container');
			const shine = document.querySelector('.shine');

			// 1. Initial delay then fade logo in
			setTimeout(() => {
				container.classList.add('fade-in');
			}, 500);

			// 2. Trigger the shine effect
			setTimeout(() => {
				shine.classList.add('run-shine');
			}, 2500);

			// 3. Fade out the whole overlay and reveal the game
			setTimeout(() => {
				overlay.style.opacity = '0';
				setTimeout(() => {
					overlay.style.display = 'none'; // Completely hidden from clicks
					introdone = true;
				}, 2000);
			}, 6500);
		}

		// Trigger the intro when the logo image has loaded
		const logoImg = document.getElementById('game-logo');
		if (logoImg.complete) {
			runIntro();
		} else {
			logoImg.onload = runIntro;
		}

        window.addEventListener('resize', () => {
            const aspect = window.innerWidth / window.innerHeight;
            camera.left = -d * aspect; camera.right = d * aspect;
            camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight);
        });