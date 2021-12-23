import { REACT_TEXT, REACT_FORWARD_REF } from './constant'
import { addEvent } from './event'

function render(vdom, container) {
	mount(vdom, container)
}

/**
 * 挂载真实dom
 * @param {object} vdom 虚拟dom
 * @param {document} container 容器
 */
function mount(vdom, container) {
	const dom = createDOM(vdom)
	if (dom) {
		container.appendChild(dom)
		// dom 渲染完成后触发声明周期
		if (dom.componentDidMount) {
			dom.componentDidMount()
		}
	}
}

/**
 * 把虚拟dom转成真实dom
 * @param {object} vdom 虚拟dom
 * @returns 真实dom
 */
function createDOM(vdom) {
	const { type, props, ref } = vdom
	let dom
	if (type && type.$$typeof === REACT_FORWARD_REF) {
		return mountForwardComponent(vdom)
	} else if (type === REACT_TEXT) {
		dom = document.createTextNode(props)
	} else if (typeof type === 'function') {
		if (type.isReactClassComponent) {
			return mountClassComponent(vdom)
		} else {
			return mountFunctionComponent(vdom)
		}
	} else {
		dom = document.createElement(type)
	}

	if (props) {
		updateProps(dom, null, props)
		const { children } = props
		if (typeof children === 'object' && children.type) {
			mount(children, dom)
		} else if (Array.isArray(children)) {
			reconcileChildren(children, dom)
		}
	}

	// 让vdom的dom属性指向创建出来的真实dom
	vdom.dom = dom

	if (ref) {
		ref.current = dom
	}
	return dom
}

function mountForwardComponent(vdom) {
	const { type, props, ref } = vdom
	const renderVdom = type.render(props, ref)
	vdom.oldRenderVdom = renderVdom
	return createDOM(renderVdom)
}

/**
 * 挂载函数组件
 * @param {object} vdom 虚拟dom
 * @returns 真实dom
 */
function mountFunctionComponent(vdom) {
	// type函数本身
	const { type, props } = vdom
	// 把属性对象传给函数执行，返回要渲染的虚拟dom
	const renderVdom = type(props)
	// vdom.老的要渲染的虚拟DOM = renderVdom，用于dom diff
	vdom.oldRenderVdom = renderVdom
	return createDOM(renderVdom)
}

/**
 * 挂载类组件
 * @param {object} vdom 虚拟dom
 * @returns 真实dom
 */
function mountClassComponent(vdom) {
	const { type: ClassComponent, props, ref } = vdom
	const classInstance = new ClassComponent(props)
	vdom.classInstance = classInstance
	// 让 ref.current 指向类组件的实例
	if (ref) {
		ref.current = classInstance
	}
	// dom挂载前触发生命周期
	if (classInstance.componentWillMount) {
		classInstance.componentWillMount()
	}
	const renderVdom = classInstance.render()
	// 把上次render渲染得到的虚拟dom挂载
	classInstance.oldRenderVdom = renderVdom
	const dom = createDOM(renderVdom)
	// dom 上挂个声明周期函数，在渲染完成后触发该函数
	if (classInstance.componentDidMount) {
		dom.componentDidMount = classInstance.componentDidMount.bind(this)
	}
	return dom
}

/**
 * 处理子元素，将子元素挂载到父元素上
 * @param {array} children 虚拟dom子元素
 * @param {document} parentDOM 父元素
 */
function reconcileChildren(children, parentDOM) {
	children.forEach(vdom => {
		mount(vdom, parentDOM)
	})
}

/**
 * 更新属性
 * @param {document} dom 真实dom
 * @param {object} oldProps 老的属性
 * @param {object} newProps 新的属性
 */
function updateProps(dom, oldProps = {}, newProps = {}) {
	for (const key in newProps) {
		if (key === 'children') {
			continue
		} else if (key === 'style') {
			const styleObj = newProps[key]
			for (const attr in styleObj) {
				dom.style[attr] = styleObj[attr]
			}
		} else if (/^on[A-Z].*/.test(key)) {
			// dom[key.toLowerCase()] = newProps[key]
			addEvent(dom, key.toLowerCase(), newProps[key])
		} else {
			dom[key] = newProps[key]
		}
	}
	// 若老属性上的值，新属性没有，则删除老的
	for (const key in oldProps) {
		if (!newProps.hasOwnProperty(key)) {
			dom[key] = null
		}
	}
}

export function findDOM(vdom) {
	if (!vdom) return null
	// 如果vdom上有dom属性，说明这个vdom是一个原生组件
	if (vdom.dom) {
		return vdom.dom // 返回它对应的真实DOM即可
	} else {
		// 它可能是一个函数组件或类组件
		const renderVdom = vdom.classInstance ? vdom.classInstance.oldRenderVdom : vdom.oldRenderVdom
		return findDOM(renderVdom)
	}
}

/**
 * 进行DOM-DIFF
 * @param {document} parentDOM 父真实dom节点
 * @param {object} oldVdom 老的虚拟dom
 * @param {object} newVdom 新的虚拟dom
 */
export function compareTwoVdom(parentDOM, oldVdom, newVdom, nextDOM) {
	if (!oldVdom && !newVdom) {
		return
	} else if (oldVdom && !newVdom) {
		unMountVdom(oldVdom)
	} else if (!oldVdom && newVdom) {
		didMountVdom(parentDOM, newVdom, nextDOM)
	} else if (oldVdom && newVdom && oldVdom.type !== newVdom.type) {
		unMountVdom(oldVdom)
		didMountVdom(parentDOM, newVdom, nextDOM)
	} else {
		updateElement(oldVdom, newVdom)
	}
}

/**
 * 深度比较新老dom差异，把差异同步到真实dom
 * @param {object} oldVdom 老的虚拟dom
 * @param {object} newVdom 新的虚拟dom
 */
function updateElement(oldVdom, newVdom) {
	// 如果是文本节点
	if (oldVdom.type === REACT_TEXT) {
		const currentDOM = newVdom.dom = findDOM(oldVdom)
		if (oldVdom.props !== newVdom.props) {
			currentDOM.textContent = newVdom.props
		}
	} else if (typeof oldVdom.type === 'string') {
		const currentDOM = newVdom.dom = findDOM(oldVdom)
		updateProps(currentDOM, oldVdom.props, newVdom.props)
		updateChildren(currentDOM, oldVdom.props.children, newVdom.props.children)
	} else if (typeof oldVdom.type === 'function') {
		if (oldVdom.type.isReactClassComponent) {
			updateClassComponent(oldVdom, newVdom)
		} else {
			updateFunctionComponent(oldVdom, newVdom)
		}
	}
}

function updateClassComponent(oldVdom, newVdom) {
	// 让新的虚拟DOM对象复用老的类组件实例
	const classInstance = newVdom.classInstance = oldVdom.classInstance
	//  如果有componentWillReceiveProps生命周期则执行并把新的props传过去
	if (classInstance.componentWillReceiveProps) {
		classInstance.componentWillReceiveProps(newVdom.props)
	}
	// 通知更新组件
	classInstance.updater.emitUpdate(newVdom.props)
}

function updateFunctionComponent(oldVdom, newVdom) {
	const currentDOM = findDOM(oldVdom)
	if (currentDOM) return
	const parentDOM = currentDOM.parentNode
	const { type, props } = newVdom
	const newRenderVdom = type(props)
	compareTwoVdom(parentDOM, oldVdom.oldRenderVdom, newRenderVdom)
	newVdom.oldRenderVdom = newRenderVdom
}

function updateChildren(parentDOM, oldVChildren, newVChildren) {
	oldVChildren = (Array.isArray(oldVChildren) ? oldVChildren : [oldVChildren])
	newVChildren = (Array.isArray(newVChildren) ? newVChildren : [newVChildren])
	const maxLength = Math.max(oldVChildren.length, newVChildren.length)

	for (let i = 0; i < maxLength; i++) {
		const nextVdom = oldVChildren.find((item, index) => index > i && item && findDOM(item))
		compareTwoVdom(parentDOM, oldVChildren[i], newVChildren[i], nextVdom && findDOM(nextVdom))
	}
}

function didMountVdom(parentDOM, vdom, nextDOM) {
	const newDOM = createDOM(vdom)
	if (nextDOM) {
		parentDOM.insertBefore(newDOM, nextDOM)
	} else {
		parentDOM.appendChild(newDOM)
	}
	if (newDOM.componentDidMount) {
		newDOM.componentDidMount()
	}
}

function unMountVdom(vdom) {
	const { props, ref } = vdom
	// 获取当前真实DOM
	const currentDOM = findDOM(vdom)
	// 如果 vdom 上有 classInstance 说明是类组件
	if (vdom.classInstance && vdom.classInstance.componentWillUnmount) {
		// 执行类组件卸载声明周期
		vdom.classInstance.componentWillUnmount()
	}
	if (ref) {
		ref.current = null
	}
	if (props.children) {
		const children = Array.isArray(props.children) ? props.children : [props.children]
		children.forEach(unMountVdom)
	}
	// 把此虚拟DOM对应的老的DOM节点从父节点中移除
	console.log('%c AT-[ currentDOM.parentNode ]-278', 'font-size:13px; background:#de4307; color:#f6d04d;', currentDOM.parentNode)
	if (currentDOM) {
		currentDOM.parentNode.removeChild(currentDOM)
	}
}

const ReactDOM = {
	render
}

export default ReactDOM
