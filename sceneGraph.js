
var SGraph;
var DRAW_TYPE_DEFAULT = 0;
var DRAW_TYPE_COLOR = 1;
var DRAW_TYPE_ORTHO = 2;
var DRAW_TYPE_SHADOW = 3;

/** object: an abstraction for a object. Objects contain a material, geometry,
 *  and transform object to define it. Objects can also be deactivated, causing
 *  their motion to still be upated, but they won't be drawn to the screen.
 */
class object {
    /** constructor: builds an instance of an object with given attributes.
     *  @param { transform } transform: the orientation and position of the object.
     *  @param { material } material: the material that defines an object.
     *  @param { geometry } geometry: the object's geometry to define it.
     *  @param { texture } texture: the object's texture if present.
     *  @param { collider } collider: the object's collider.
     *  @param { rigidBody } rigidBody: the object's rigidbody. 
     */
    constructor (_transform, _material, _geometry, _texture, _collider, _rigidBody) {
        this.transform = _transform || new transform ();
        this.material = _material;
        this.geometry = _geometry;
        this.texture = _texture;
        this.collider = _collider || new nullCollider ();
        this.camera = null;

        if (this.collider) {
            this.collider.object = this;
        }

        if (_rigidBody) {
            this.addRigidBody (_rigidBody);
        }

        this.mouseTriggers = [];
        this.worldView = mat4.create ();

        this.drawType = gl.TRIANGLES;
        this.active = true;
        this.tag = "default";
        this.children = [];

        this.animations = [];

        this.scene = null;
    }

    /** update: event loop function. Calls the update function for the transform component.
     *  @param { float } dTime: the time since the last framce callback (in seconds).
     */
    update (dTime) {
        if (this.rigidBody) {
            this.rigidBody.update (dTime);
        }
        
        if (this.camera) {
            this.camera.position = vec3.clone (this.transform.position);
            this.transform.rotation = quat.clone (this.camera.rotation);
        }

        this.transform.update ();

    }

    /** setup: sets up all the webgl attributes and uniforms for the object. 
     */
    setup () {
        if (this.material) {
            this.material.setup ();
        } 

        if (this.texture) {
            this.texture.setup (); 
        } 

        if (this.mouseTriggers.length) {
            this.mouseTriggers[0].setup ();
        } else {
            gl.uniform4fv (gl.getUniformLocation (program, "fTriggerID"), vec4.fromValues (0.0, 0.0, 0.0, 1.0));   
        }

        if (this.geometry) {
            this.geometry.setup ();
            gl.uniformMatrix4fv (modelMatrixLoc, false, this.collider.matrix);
            gl.uniformMatrix4fv (cameraMatrixLoc, false, currentScene.playerController.player.camera.view);
            gl.uniformMatrix4fv (projectionMatrixLoc, false, currentScene.playerController.player.camera.perspectiveProjectionMatrix); 

            var CTMN = mat3.create ();
            mat3.normalFromMat4 (CTMN, this.collider.matrix);
            gl.uniformMatrix3fv (normalMatrixLoc, false, CTMN);
        }
    }

    /** draw: draws the object to the screen if geometry is present
     */
    draw () {
        if (this.geometry) {
            if (this.material.ambient[3] != 1.0) {
                gl.enable (gl.BLEND);
                gl.blendFunc (gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
                gl.disable (gl.DEPTH_TEST);

                gl.drawArrays (this.drawType, 0, this.geometry.Nvertices);

                gl.disable(gl.BLEND);
                gl.enable (gl.DEPTH_TEST);
            } else {
                gl.drawArrays (this.drawType, 0, this.geometry.Nvertices);
            }
        }
    }

    /** loadFromObj: loads the object from an .obj, .mat, and texture image.
     *  @param: { HTML ID } ObjID: the html ID for the .obj file.
     *  @param: { HTML ID } MatID: the html ID for the .mat file.
     *  @param: { HTML ID } TexID: the html ID for the texture image.
     */
    loadFromObj (ObjID, MatID, TexID) {
        var ObjEle = document.getElementById(ObjID).contentWindow.document.body.textContent;
        if (!ObjEle) { 
            alert ("Unable to load object file " + ObjID);
            return -1;
        }

        var MatEle = document.getElementById (MatID).contentWindow.document.body.textContent;
        if (!MatEle) { 
            alert ("Unable to load material file " + MatID);
            return -1;
        }

        var TexEle = document.getElementById (TexID);
        if (!TexEle) { 
            alert ("Unable to load texture file " + TexID);
            return -1;
        }

        var lines = ObjEle.split ("\n");
        var indexes = [];
        var vertices = [];
        var normals = [];
        var tex = [];

        var points_Array = [];
        var normals_Array = [];
        var texture_Array = [];

        for (var i = 0; i < lines.length; i++) {
            if (lines[i][0] == 'f') {
                indexes.push (lines[i].substr (2).split (' '));
            } else if (lines[i][0] == 'v' && lines[i][1] == ' ') {
                vertices.push (lines[i].substr (2).split (' '));
            } else if (lines[i][0] == 'v' && lines[i][1] == 't') {
                tex.push (lines[i].substr (3).split (' '));
            } else if (lines[i][0] == 'v' && lines[i][1] == 'n') {
                normals.push (lines[i].substr (3).split (' '));
            }
        }

        for (var i = 0; i < indexes.length; i++) {
            for (var j = 0; j < indexes[i].length; j++) {
                var line = indexes[i][j].split ('/');

                points_Array.push (vertices[line[0] - 1]);
                texture_Array.push (tex[line[1] - 1]);
                normals_Array.push (normals[line[2] - 1]);
            }
        }

        var min_X = 10000;
        var min_Y = 10000;
        var min_Z = 10000;
        var max_X = -10000;
        var max_Y = -10000;
        var max_Z = -10000;

        for (var i = 0; i < points_Array.length; i++) {
            points_Array[i] = vec4.fromValues (points_Array[i][0], points_Array[i][1], points_Array[i][2], 1.0);
            min_X = Math.min (min_X, points_Array[i][0]);
            min_Y = Math.min (min_Y, points_Array[i][1]);
            min_Z = Math.min (min_Z, points_Array[i][2]);

            max_X = Math.max (max_X, points_Array[i][0]);
            max_Y = Math.max (max_Y, points_Array[i][1]);
            max_Z = Math.max (max_Z, points_Array[i][2]);
        }

        var collider = [];
        this.collider = new boxCollider (vec3.fromValues (min_X, min_Y, min_Z), vec3.fromValues (max_X, max_Y, max_Z), "static");
        this.collider.object = this;

        for (var i = 0; i < points_Array.length; i++) {
            normals_Array[i] = vec3.fromValues (normals_Array[i][0], normals_Array[i][1], normals_Array[i][2]);
        }

        for (var i = 0; i < points_Array.length; i++) {
            texture_Array[i] = vec2.fromValues (texture_Array[i][0], texture_Array[i][1]);
        }

        lines = MatEle.split ("\n");

        var shininess;
        var ambient;
        var diffuse;
        var specular;

        for (var i = 0; i < lines.length; i++) {
            if (lines[i][0] == 'N' && lines[i][1] == 's') {
                shininess = lines[i].substr (3).split (' ');
            } else if (lines[i][0] == 'K' && lines[i][1] == 'a') {
                ambient = lines[i].substr (3).split (' ');
            } else if (lines[i][0] == 'K' && lines[i][1] == 'd') {
                diffuse = lines[i].substr (3).split (' ');
            } else if (lines[i][0] == 'K' && lines[i][1] == 's') {
                specular = lines[i].substr (3).split (' ');
            }
        }

        ambient = vec4.fromValues (ambient[0], ambient[1], ambient[2], 1.0);
        diffuse = vec4.fromValues (diffuse[0], diffuse[1], diffuse[2], 1.0);
        specular = vec4.fromValues (specular[0], specular[1], specular[2], 1.0);
        shininess = shininess[0];

        this.geometry = new geometry (points_Array, normals_Array, texture_Array);
        this.material = new material (ambient, diffuse, specular, shininess);
        this.texture = new texture (TexEle);
    }

    addOnMouseClickTrigger (_function) {
        var x = new mouseTrigger (this, _function, "click");
        this.mouseTriggers.push (x);
        if (this.scene) {
            this.scene.clickManager.addTrigger (x);
        }
    }

    addOnMouseHoverTrigger (_function) {
        var x = new mouseTrigger (this, _function, "hover");
        this.mouseTriggers.push (x);
        if (this.scene) {
            this.scene.clickManager.addTrigger (x);
        }
    }

    addOnMouseEnterTrigger (_function) {
        var x = new mouseTrigger (this, _function, "enter");
        this.mouseTriggers.push (x);
        if (this.scene) {
            this.scene.clickManager.addTrigger (x);
        }
    }

    addOnMouseExitTrigger (_function) {
        var x = new mouseTrigger (this, _function, "exit");
        this.mouseTriggers.push (x);
        if (this.scene) {
            this.scene.clickManager.addTrigger (x);
        }
    }

    clone () {
        var newTransform = null;
        if (this.transform) {
            newTransform = new transform (vec3.clone (this.transform.position), 
                                          vec3.clone (this.transform.scale),
                                          quat.clone (this.transform.rotation));
        }

        var newMaterial = null;
        if (this.material) { 
            var newMaterial = new material (vec4.clone (this.material.ambient),
                                            vec4.clone (this.material.diffuse),
                                            vec4.clone (this.material.specular),
                                            this.material.shininess);
        }

        var newGeometry = null;
        if (this.geometry) {
            newGeometry = this.geometry;
        }

        var newCollider = new nullCollider ();
        switch (this.collider.type) {
            case "box":
            {
                newCollider = new boxCollider (this.collider.min, this.collider.max, this.collider.physics);
                newCollider.collisionFunction = this.collider.collisionFunction;
                break;
            }
            case "sphere":
            {
                newCollider = new sphereCollider (this.collider.center, this.collider.radius, this.collider.physics);
                newCollider.collisionFunction = this.collider.collisionFunction;
                break;
            }
        }

        var newRigidBody = null;
        if (this.rigidBody) {
            newRigidBody = new rigidBody (this.rigidBody.mass, this.rigidBody.type);
        }

        var newTexture = null;
        if (this.texture) {
            newTexture = new texture (this.texture.image, this.texture.options);
        }

        var newObject = new object (newTransform, newMaterial, newGeometry, newTexture, newCollider, newRigidBody);

        newObject.drawType = this.drawType;
        newObject.tag = this.tag;
        newObject.scene = this.scene;

        for (var i = 0; i < this.mouseTriggers.length; i++) {
            if (this.mouseTriggers[i].type == "click") {
                newObject.addOnMouseClickTrigger (this.mouseTriggers[i].func);
            } else if (this.mouseTriggers[i].type == "hover") {
                newObject.addOnMouseHoverTrigger (this.mouseTriggers[i].func);
            } else if (this.mouseTriggers[i].type == "enter") {
                newObject.addOnMouseEnterTrigger (this.mouseTriggers[i].func);
            } else if (this.mouseTriggers[i].type == "exit") {
                newObject.addOnMouseExitTrigger (this.mouseTriggers[i].func);
            } 
        }

        for (var i = 0; i < this.animations.length; i++) {
            newObject.addAnimation (this.animations[i].clone ());
        }

        for (var i = 0; i < this.children.length; i++) {
            newObject.children.push (this.children[i].clone ());
        }

        return newObject;
    }

    addRigidBody (_rigidBody) {
        this.rigidBody = _rigidBody;
        if (this.rigidBody) {
            this.rigidBody.object = this;
            if (this.collider) {
                if (this.collider.type == "box") {
                    var x = this.collider.max[1] * this.collider.max[1] + this.collider.max[2] * this.collider.max[2];
                    var y = this.collider.max[0] * this.collider.max[0] + this.collider.max[2] * this.collider.max[2];
                    var z = this.collider.max[0] * this.collider.max[0] + this.collider.max[1] * this.collider.max[1];

                    var M = this.rigidBody.mass / 3;
                    var I_body = mat3.fromValues (x * M, 0.0,   0.0, 
                                                  0.0,   y * M, 0.0,   
                                                  0.0,   0.0,   z * M);

                    this.rigidBody.Ibody = I_body;
                    this.rigidBody.CoM = this.collider.center;

                    var inv_I_body = mat3.create ();
                    mat3.invert (inv_I_body, I_body);
                    this.rigidBody.inv_Ibody = inv_I_body;
                } else if (this.collider.type == "sphere") {
                    var R = this.rigidBody.mass * this.collider.radius * this.collider.radius * (2 / 5);

                    var I_body = mat3.fromValues (R,   0.0, 0.0, 
                                                  0.0, R,   0.0,   
                                                  0.0, 0.0, R   );

                    this.rigidBody.Ibody = I_body;
                    this.rigidBody.CoM = this.collider.center;

                    var inv_I_body = mat3.create ();
                    mat3.invert (inv_I_body, I_body);
                    this.rigidBody.inv_Ibody = inv_I_body;
                }
            }
        }
    }

    addAnimation (_animation) {
        this.animations.push (_animation);
        _animation.object = this;

        if (this.scene) {
            this.scene.animationsManager.addAnimation (_animation);
        }
    }

    removeAnimation (_animation) {
        for (var i =0 ;i < this.animations.length; i++) {
            if (this.animations[i] == _animation) {
                this.animations.splice (i, 1);
                this.scene.animationsManager.removeAnimation (_animation);
                return;
            }
        }
    }
}


class sceneGraph {
	constructor (_build_function) {
		this.root = new object ();
		this.root.children = [];
        this.lightsManager = new lightHandler (this);
        this.animationsManager = new animationHandler (this);
        this.collisionsManager = new sceneCollisionManager (this);
        this.clickManager = new clickHandler (this);

        this.build_function = _build_function;

        this.playerController = null;

        this.root.tag = "root";
        this.tag = "default";
	}

	drawTree (type) {
        var PC = mat4.create ();
        var PL = mat4.create ();

        if (type >= DRAW_TYPE_SHADOW) {
            if (!this.lightsManager.lightSources[type - DRAW_TYPE_SHADOW].shadows)
                return;

            mat4.mul (PC, this.lightsManager.lightSources[type - DRAW_TYPE_SHADOW].projectionMatrix, this.lightsManager.lightSources[type - DRAW_TYPE_SHADOW].view);
            mat4.mul (PL, this.lightsManager.lightSources[type - DRAW_TYPE_SHADOW].projectionMatrix, this.lightsManager.lightSources[type - DRAW_TYPE_SHADOW].view);
        } else {
            mat4.mul (PC, this.playerController.player.camera.perspectiveProjectionMatrix, this.playerController.player.camera.view);
            mat4.mul (PL, this.lightsManager.lightSources[0].projectionMatrix, this.lightsManager.lightSources[0].view);
        }

        for (var i = 0; i < this.root.children.length; i++) {
            this.__drawTree_AUX (this.root.children[i], PC, PL, type);
        }
	}

	__drawTree_AUX (root, PC, PL, type) {
		if (!root.active)
			return;

        if (type == DRAW_TYPE_DEFAULT || root.tag != "world") {
    		if (root.collider.type == "null") {
                this.drawNode (root);
            } else if (root.collider.inFustrum (PC) || root.collider.inFustrum (PL)) {
                this.drawNode (root);
            } 
        }
        for (var i = 0; i < root.children.length; i++) {
            this.__drawTree_AUX (root.children[i], PC, PL, type);
        }
	}

	drawNode (obj) {
        obj.setup (this.playerController.player);
        obj.draw ();
	}

    getObjects () {
        var objects = [];
        for (var i = 0; i < this.root.children.length; i++) {
            this.__getObjects_AUX (this.root.children[i], objects);
        }

        return objects;
    }

    __getObjects_AUX (root, objects) {
        objects.push (root);

        for (var i = 0; i < root.children.length; i++) {
            this.__getObjects_AUX (root.children[i], objects);
        }
    }

    getObjectsByTag (tag) {
        var objects = [];
        for (var i = 0; i < this.root.children.length; i++) {
            this.__getObjectsByTag_AUX (tag, this.root.children[i], objects);
        }

        return objects;
    }

    __getObjectsByTag_AUX (tag, root, objects) {
        if (root.tag == tag) {
            objects.push (root);
        }

        for (var i = 0; i < root.children.length; i++) {
            this.__getObjectsByTag_AUX (tag, root.children[i], objects);
        }
    }

    getObjectByTag (tag) {
        for (var i = 0; i < this.root.children.length; i++) {
            return this.__getObjectByTag_AUX (tag, this.root.children[i]);
        }
    }

    __getObjectByTag_AUX (tag, root) {
        if (root.tag == tag) {
            return root;
        }

        for (var i = 0; i < root.children.length; i++) {
            this.__getObjectByTag_AUX (tag, root.children[i]);
        }
    }

    set () {
        this.lightsManager.setupAll ();
        var CTM = mat4.create ();

        for (var i = 0; i < this.root.children.length; i++) {
            this.__set_AUX (this.root.children[i], CTM, 1.0);
        }
    }

    __set_AUX (root, CTM, scaling) {
        if (root.tag != "player") {
            var CTM_prime = mat4.create ();
            mat4.mul (CTM_prime, CTM, root.transform.matrix);
            var scaling_prime = scaling * root.transform.scale[0];
            root.collider.matrix = mat4.clone (CTM_prime);
            if (root.collider.type == "sphere") {
                root.collider.scaling = scaling_prime;
            }

            if (root.collider.type != "null") {
                root.collider.setup ();
                this.collisionsManager.objects.push (root);
            }
        } else {
            var CTM_prime = mat4.create ();
            var transformMat = mat4.create ();
            mat4.fromRotationTranslationScale (transformMat, quat.create (), root.transform.position, root.transform.scale);
            mat4.mul (CTM_prime, CTM, transformMat);
            var scaling_prime = scaling * root.transform.scale[0];
            root.collider.matrix = mat4.clone (CTM_prime);
            if (root.collider.type == "sphere") {
                root.collider.scaling = scaling_prime;
            }

            if (root.collider.type != "null") {
                root.collider.setup ();
                this.collisionsManager.objects.push (root);
            }
            CTM_prime = mat4.create ();
            mat4.mul (CTM_prime, CTM, root.transform.matrix);
        }   

        for (var i = 0; i < root.children.length; i++) {
            this.__set_AUX (root.children[i], CTM_prime, scaling_prime);
        }
    }

    update (dTime) {
        for (var i = 0; i < this.root.children.length; i++) {
            this.__update_AUX (dTime, this.root.children[i]);
        }
    }

    __update_AUX (dTime, root) {
        if (!root.active)
            return;

        root.update (dTime);
            
        for (var i = 0; i < root.children.length; i++) {
            this.__update_AUX (dTime, root.children[i]);
        }
    }

    remove (object) {
        for (var i = 0; i < this.root.children.length; i++) {
            this.__remove_AUX (this.root, object);
        }
    }

    __remove_AUX (root, object) {
        for (var i = 0; i < root.children.length; i++) {
            if (root.children[i] == object) {
                for (var j = 0; j < root.children[i].animations.length; j++) {
                    this.animationsManager.removeAnimation (root.children[i].animations[j]);
                }

                for (var j = 0; j < root.children[i].mouseTriggers.length; j++) {
                    this.clickManager.removeTrigger (root.children[i].mouseTriggers[j]);
                }
                root.children.splice (i, 1);
                i--;
            } else {
                this.__remove_AUX (root.children[i], object);
            }
        }
    }

    removeByTag (tag) {
        for (var i = 0; i < this.root.children.length; i++) {
            this.__removeByTag_AUX (this.root, tag);
        }
    }

    __removeByTag_AUX (root, tag) {
        for (var i = 0; i < root.children.length; i++) {
            if (root.children[i].tag == tag) {
                for (var j = 0; j < root.children[i].animations.length; j++) {
                    this.animationsManager.removeAnimation (root.children[i].animations[j]);
                }

                for (var j = 0; j < root.children[i].mouseTriggers.length; j++) {
                    this.clickManager.removeTrigger (root.children[i].mouseTriggers[j]);
                }
                root.children.splice (i, 1);
                i--;
            } else {
                this.__removeByTag_AUX (root.children[i], tag);
            }
        }
    }

    render (dTime) {
        this.animationsManager.animateAll (dTime);
        this.set ();
        this.collisionsManager.detectAllCollisions ();
        this.collisionsManager.handleAllContactCollisions ();
        this.update (dTime);

        gl.viewport (0, 0, OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT); 
        gl.uniform1i (gl.getUniformLocation (program, "vDrawType"), DRAW_TYPE_SHADOW); 
        gl.uniform1i (gl.getUniformLocation (program, "fDrawType"), DRAW_TYPE_SHADOW);

        for (var i = 0; i < this.lightsManager.lightSources.length; i++) {

            gl.uniform1i (gl.getUniformLocation (program, "vDrawType"), DRAW_TYPE_SHADOW + i); 
            gl.uniform1i (gl.getUniformLocation (program, "fDrawType"), DRAW_TYPE_SHADOW + i);

            gl.bindFramebuffer (gl.FRAMEBUFFER, shadowFramebuffers[i]);
            gl.enable (gl.DEPTH_TEST);
            gl.clear (gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

            this.drawTree (DRAW_TYPE_SHADOW + i);
        }

        gl.bindFramebuffer (gl.FRAMEBUFFER, null);
        gl.clear (gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.viewport (0, 0, canvas.width, canvas.height); 

        gl.uniform1i (gl.getUniformLocation (program, "vDrawType"), DRAW_TYPE_COLOR); 
        gl.uniform1i (gl.getUniformLocation (program, "fDrawType"), DRAW_TYPE_COLOR); 
        gl.bindFramebuffer (gl.FRAMEBUFFER, colorFramebuffer);
        gl.clear (gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.disable (gl.DEPTH_TEST);

        this.drawTree (DRAW_TYPE_COLOR);

        gl.readPixels (canvas.width / 2, canvas.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.clickManager.pixel);
        this.clickManager.handleMouseEvents ();

        gl.enable (gl.DEPTH_TEST);
        gl.clear (gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.bindFramebuffer (gl.FRAMEBUFFER, null);

        gl.uniform1i (gl.getUniformLocation (program, "vDrawType"), DRAW_TYPE_DEFAULT); 
        gl.uniform1i (gl.getUniformLocation (program, "fDrawType"), DRAW_TYPE_DEFAULT); 

        for (var i = 0; i < this.lightsManager.lightSources.length; i++) {
            gl.activeTexture (gl.TEXTURE1 + i);
            gl.bindTexture (gl.TEXTURE_2D, shadowFramebuffers[i].texture);
            gl.uniform1i (gl.getUniformLocation (program, "shadowMap[" + i + "]"), 1 + i); 
        }

        this.drawTree (DRAW_TYPE_DEFAULT);
        
        for (var i = 0; i < this.lightsManager.lightSources.length; i++) {
            gl.activeTexture (gl.TEXTURE1 + i);
            gl.bindTexture (gl.TEXTURE_2D, null);
            gl.uniform1i (gl.getUniformLocation (program, "shadowMap[" + i + "]"), 1 + i); 
        }

        crosshair.setup ();
        crosshair.draw ();
    }

    updateCamera (dTime) {
        this.playerController.player.camera.updateRotation (dTime);
        gl.uniform3fv (gl.getUniformLocation (program, "fCameraPosition"), this.playerController.player.camera.position);

        var rate = 12;
        if (this.playerController.movingforward) this.playerController.moveForward (dTime * rate);
        if (this.playerController.movingbackward) this.playerController.moveBackward (dTime * rate);
        if (this.playerController.movingleft) this.playerController.moveLeft (dTime * rate);
        if (this.playerController.movingright) this.playerController.moveRight (dTime * rate);
        if (this.playerController.movingup) this.playerController.jump (dTime * rate);
        if (this.playerController.movingdown) this.playerController.moveDown (dTime * rate);
    }

    build () {
        this.build_function (this);
        var objs = this.getObjects ();
        for (var i = 0; i < objs.length; i++) {
            var currentObject = objs[i];
            for (var j = 0; j < currentObject.mouseTriggers.length; j++) {
                this.clickManager.addTrigger (currentObject.mouseTriggers[j]);
            }

            for (var j = 0; j < currentObject.animations.length; j++) {
                this.animationsManager.addAnimation (currentObject.animations[j]);
            }
        }
    }

    push (object) {
        this.root.children.push (object);

        object.scene = this;
        for (var i = 0; i < object.children.length; i++) {
            this.__push_AUX (object.children[i]);
        }
    }

    __push_AUX (object) {
        object.scene = this;
            
        for (var i = 0; i < object.children.length; i++) {
            this.__push_AUX (object.children[i]);
        }
    }

    resetScene () {
        this.root = new object ();
        this.root.children = [];
        this.lightsManager = new lightHandler (this);
        this.animationsManager = new animationHandler (this);
        this.collisionsManager = new sceneCollisionManager (this);
        this.clickManager = new clickHandler (this);

        this.playerController = null;
        this.root.tag = "root";

        this.build ();
    }
}

