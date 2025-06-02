<template>
    <button @click="enableproxy" class="control row items-center justify-center" :class="{'active' : storage.state}">
        <span>⏻</span>
    </button>
</template>

<script>
import useStore from '../stores/useStore';
import { enableBadge, disableBadge } from '../utils/badge';
import { disableProxy, enableProxy } from '../utils/proxy';
export default {
    data() {
        return {
            storage: useStore(),
        }
    },
    
    methods: {
        async enableproxy() {
            if(!this.storage.state) {
                const result = enableProxy();
                if(result) {
                    this.storage.changeState();
                    enableBadge();
                }
            } else {
                const result = await disableProxy();
                if(result)  {
                    this.storage.changeState();
                    disableBadge();
                }
            }
        },
    }
}
</script>

<style scoped>
.control {
    position: absolute;
    bottom: -60px;
    left: 0;
    right: 0;
    margin: auto;
    width: 120px;
    height: 120px;
    border-radius: 50%;
    border: 10px solid #F1F5F9;
    background-color: #E67B7B;
    color: white;
    font-size: 2rem;
    box-shadow: rgba(0, 0, 0, 0.35) 0px -50px 36px -28px inset;
    cursor: pointer;
}

.control>span {
    line-height: 2rem;
}

.control::after {
    content: 'Disconnected';
    position: absolute;
    width: 100%;
    background-color: #FFE6E6;
    color: #E67B7B;
    border: 1px solid #E67B7B;
    top: -45px;
    border-radius: 1rem;
    padding: .3rem 1rem;
    font-size: .8rem;
    display: flex;
    justify-content: center;
    align-items: center;
}

.active {
    background-color: #4AC176;
}

.active::after {
    content: 'Conected';
    color: #4AC176;
    border-color: #4AC176;
    background-color: #CBFFDE;
}
</style>