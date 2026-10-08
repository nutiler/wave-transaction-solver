import test from 'node:test';
import assert from 'node:assert/strict';
import {helperVisualState} from '../extension/helper-status.js';
test('Sign-in breaks remain amber paused even when the underlying helper says Stopped',()=>{
 assert.deepEqual(helperVisualState('Stopped: The provider needs sign-in. Open it and Resume.'),{kind:'paused',label:'Paused — sign in required'});
 assert.equal(helperVisualState('Stopped: Log in to PayPal.',true).kind,'paused');assert.equal(helperVisualState('Sign in if needed, then Start fresh.').kind,'ready');
});
test('Waiting differentiates active automatic work from a break requiring Resume',()=>{
 assert.equal(helperVisualState('Waiting for reports; refreshing automatically.',true).kind,'waiting');assert.equal(helperVisualState('Report is still pending. Resume later.',false).kind,'paused');
 assert.equal(helperVisualState('7/8 originals saved. Resume checks remaining years.',false).kind,'paused');
});
test('Start, stop, completion and failures retain separate textual states',()=>{
 assert.equal(helperVisualState('Preparing collection.',true).kind,'running');assert.equal(helperVisualState('Stopping after this download.',true).kind,'stopped');assert.equal(helperVisualState('Stopped. Resume continues this batch.').kind,'stopped');assert.equal(helperVisualState('8/8 yearly CSVs downloaded and verified.').kind,'complete');assert.equal(helperVisualState('Import failed.').kind,'error');
});
