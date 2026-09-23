class ModelRenderer {
    constructor() {
        this.canvas = document.createElement('canvas');
        if (typeof THREE === 'undefined') {
            console.warn('Three.js not loaded. 3D models will not render.');
            return;
        }
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
        this.scene = new THREE.Scene();
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 1, 1).normalize();
        this.scene.add(directionalLight);

        this.camera = new THREE.PerspectiveCamera(50, 16/9, 10, 100000);
        
        this.models = new Map();
        
        this.loaders = {
            gltf: typeof THREE.GLTFLoader !== 'undefined' ? new THREE.GLTFLoader() : null,
            obj: typeof THREE.OBJLoader !== 'undefined' ? new THREE.OBJLoader() : null,
            mmd: typeof THREE.MMDLoader !== 'undefined' ? new THREE.MMDLoader() : null
        };
        this.mmdHelper = typeof THREE.MMDAnimationHelper !== 'undefined' ? new THREE.MMDAnimationHelper() : null;
    }

    async loadModel(url, vmdUrl = null) {
        const key = url + (vmdUrl ? '|' + vmdUrl : '');
        if (this.models.has(key)) return this.models.get(key);
        
        const isGLTF = url.toLowerCase().endsWith('.glb') || url.toLowerCase().endsWith('.gltf');
        const isMMD = url.toLowerCase().endsWith('.pmx') || url.toLowerCase().endsWith('.pmd');
        const loader = isGLTF ? this.loaders.gltf : isMMD ? this.loaders.mmd : this.loaders.obj;
        if (!loader) throw new Error('Model loader not available for ' + url);
        
        return new Promise((resolve, reject) => {
            if (isMMD && vmdUrl) {
                loader.loadWithAnimation(url, vmdUrl, (mmd) => {
                    const model = mmd.mesh;
                    let mixer = null;
                    if (this.mmdHelper) {
                        this.mmdHelper.add(model, { animation: mmd.animation, physics: false });
                    }
                    this.models.set(key, { model, isMMD: true });
                    resolve({ model, isMMD: true });
                }, undefined, reject);
            } else {
                loader.load(url, (result) => {
                    const model = isGLTF ? result.scene : isMMD ? result : result;
                    let mixer = null;
                    if (isGLTF && result.animations && result.animations.length) {
                        mixer = new THREE.AnimationMixer(model);
                        mixer.clipAction(result.animations[0]).play();
                    }
                    this.models.set(key, { model, mixer, isMMD });
                    resolve({ model, mixer, isMMD });
                }, undefined, reject);
            }
        });
    }

    render(modelUrl, c, latticeCamera, sw, sh, outputScale, localTime = 0, vmdUrl = null) {
        if (!this.renderer) return null;
        
        const key = modelUrl + (vmdUrl ? '|' + vmdUrl : '');
        const data = this.models.get(key);
        if (!data) {
            this.loadModel(modelUrl, vmdUrl).catch(console.error);
            return null;
        }

        const { model, mixer, isMMD } = data;

        if (mixer) {
            mixer.setTime(localTime);
        } else if (isMMD && this.mmdHelper && vmdUrl) {
            const helperState = this.mmdHelper.objects.get(model);
            if (helperState && helperState.mixer) {
                helperState.mixer.setTime(localTime);
                if (helperState.ikSolver) helperState.ikSolver.update();
                if (helperState.grantSolver) helperState.grantSolver.update();
            }
        }

        if (this.canvas.width !== sw || this.canvas.height !== sh) {
            this.renderer.setSize(sw, sh, false);
            this.camera.aspect = sw / sh;
            const fov = 2 * Math.atan(sh / (4000 * outputScale)) * (180 / Math.PI);
            this.camera.fov = fov;
            this.camera.updateProjectionMatrix();
        }

        for (let i = this.scene.children.length - 1; i >= 0; i--) {
            const child = this.scene.children[i];
            if (!child.isLight) this.scene.remove(child);
        }
        
        this.scene.add(model);

        model.position.set(c.x || 0, -(c.y || 0), -(c.z || 0)); 
        const s = (c.scale || 100) / 100;
        model.scale.set(s, s, s);
        
        model.rotation.set(
            c.rotationX ? -c.rotationX * Math.PI / 180 : 0, 
            c.rotationY ? -c.rotationY * Math.PI / 180 : 0, 
            c.rotation ? -c.rotation * Math.PI / 180 : 0
        );

        this.camera.position.set(latticeCamera.x || 0, -(latticeCamera.y || 0), -(latticeCamera.z || 0) + 2000);
        this.camera.rotation.set(
            latticeCamera.rotationX ? latticeCamera.rotationX * Math.PI / 180 : 0,
            latticeCamera.rotationY ? latticeCamera.rotationY * Math.PI / 180 : 0,
            latticeCamera.rotation ? latticeCamera.rotation * Math.PI / 180 : 0
        );
        this.camera.rotation.order = 'YXZ';

        this.renderer.render(this.scene, this.camera);
        return this.canvas;
    }
}
window.modelRenderer = new ModelRenderer();
