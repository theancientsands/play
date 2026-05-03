import * as THREE from 'three';
import { scene, gltfLoader, enemyList, createHPBar, addOutline, removeOutline, composer } from './main.js';
import { textureLoader } from './textureloader.js';

/**
 * Registry for textures and animation clips to prevent re-downloading.
 */
export const ENTITY_REGISTRY = {
    'skeleton': {
        path: './media/skeleton/',
        animations: ['idle', 'run', 'attack', 'death'],
        texturePaths: {
            map: 'Image_0.png',
            normal: 'Image_n.png'
        },
        textures: {},
        clips: {} // We'll store clips here so we don't reload .glb files for anims
    }
};

/**
 * Pre-loads textures and animation clips into memory once.
 */
export async function loadEntity(name) {
    const config = ENTITY_REGISTRY[name];
    if (!config) return;

    // 1. Load Textures
    const texPromises = Object.entries(config.texturePaths).map(async ([key, fileName]) => {
        const tex = await textureLoader.loadAsync(`${config.path}${fileName}`);
        if (key === 'map') tex.colorSpace = THREE.SRGBColorSpace;
        config.textures[key] = tex;
    });

    // 2. Load Animation Clips (Idle, Run, Attack, Death)
    const animPromises = config.animations.map(async (anim) => {
        const animGltf = await gltfLoader.loadAsync(`${config.path}${anim}.glb`);
        config.clips[anim] = animGltf.animations[0];
    });

    await Promise.all([...texPromises, ...animPromises]);
    console.log(`[EntitySystem] ${name.toUpperCase()} resources cached.`);
}

/**
 * Spawns entity using the logic from your working spawnSkeleton function
 * but pulling cached assets from the registry.
 */
export function spawnEntity(name, x, y, z) {
    const config = ENTITY_REGISTRY[name];
    
    // We call load() directly like your working code to avoid .clone() issues
    gltfLoader.load(`${config.path}idle.glb`, (gltf) => {
        const entity = gltf.scene;
        entity.scale.set(7, 7, 7);
        entity.position.set(x, y, z);

        // Apply Textures and Shadows EXACTLY like your working function
        entity.traverse(n => {
            if (n.isMesh) {
                n.material = new THREE.MeshStandardMaterial({
                    map: config.textures.map || null,
                    normalMap: config.textures.normal || null,
                    roughness: 0.8,
                    metalness: 0.2,
                    transparent: true,
                    opacity: 0 // Start invisible for your spawn logic
                });
                n.castShadow = true;
                n.frustumCulled = false;
            }
        });

        // Hitbox logic
        const hitboxGeom = new THREE.BoxGeometry(0.4, 1, 0.4);
        const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
        const hitbox = new THREE.Mesh(hitboxGeom, hitboxMat);
        hitbox.name = `${name}_Hitbox`;
        hitbox.position.y = 0.5;
        entity.add(hitbox);

        const mixer = new THREE.AnimationMixer(entity);
        const actions = {};
        
        // Map cached clips to this new mixer
        for (const [key, clip] of Object.entries(config.clips)) {
            const action = mixer.clipAction(clip);
            if (key === 'death') {
                action.setLoop(THREE.LoopOnce);
                action.clampWhenFinished = true;
            }
            actions[key] = action;
        }
		
		entity.name = name + "_" + enemyList.length.toString();

        // Setup Data Object
        entity.userData = {
            currentHP: 100,
            visualHP: 100,
            isDead: false,
            mixer: mixer,
            actions: actions,
            currentAction: actions['idle'],
            hpBar: createHPBar('red'),
            isSpawning: true,
            spawnProgress: 0,
            isAttacking: false,
            cachedHitBox: hitbox,
            separationVec: new THREE.Vector3(0, 0, 0),
            diff: new THREE.Vector3(0, 0, 0),
            dir: new THREE.Vector3(0, 0, 0)
        };

        entity.frustumCulled = false;

        // Start Idle
        if (actions['idle']) {
            actions['idle'].play();
        }

        // Scene Injection
        scene.add(entity);
        
        // Outline pre-compilation
        addOutline(entity);
        composer.render();
        removeOutline(entity);
        composer.render();

        scene.add(entity.userData.hpBar);
        enemyList.push(entity);
    });
}

/**
 * Searches the existing enemyList for a "dead" slot to reuse.
 */
export function respawnEntity(name, x, y, z) {
    // Look for a dormant entity of the same type
    const dormantEntity = enemyList.find(e => e.name === name && e.userData.isDead === true);

    if (dormantEntity) {
        const data = dormantEntity.userData;

        // 1. Reset Stats
        data.currentHP = 100;
		data.visualHP = 100;
        data.isDead = false;
        data.isSpawning = true; // Or true if you want the fade-in again
        data.spawnProgress = 0;
		data.isAttacking = false;
		
		data.separationVec = data.separationVec.set(0, 0, 0);
		data.dir = data.dir.set(0, 0, 0);
		data.diff = data.diff.set(0, 0, 0);

        // 2. Reset Physics & Visuals
        dormantEntity.position.set(x, y, z);
        data.hpBar.visible = true;

        // 3. Restart Animations
        data.mixer.stopAllAction();
		const newAction = data.actions['idle'];
		newAction.reset().fadeIn(0.2).play();
		data.currentAction = newAction;
		
		scene.add(dormantEntity);

        console.log(`[Engine] Re-activated slot: ${name}`);
        return dormantEntity;
    } else {
        // If all slots are full/active, only then spawn a brand new one
        //return spawnEntity(name, x, z);
		console.log("We did not find any enemy");
    }
}