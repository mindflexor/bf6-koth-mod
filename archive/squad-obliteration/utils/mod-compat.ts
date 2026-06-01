type ParseUiNode = {
    name: string;
    type: 'Container' | 'Text';
    position?: [number, number] | [number, number, number];
    size?: [number, number] | [number, number, number];
    anchor?: mod.UIAnchor;
    visible?: boolean;
    padding?: number;
    bgColor?: [number, number, number];
    bgAlpha?: number;
    bgFill?: mod.UIBgFill;
    textLabel?: mod.Message | string | number;
    textColor?: [number, number, number];
    textAlpha?: number;
    textSize?: number;
    textAnchor?: mod.UIAnchor;
    playerId?: mod.Player | mod.Team;
    children?: ParseUiNode[];
};

function toVector(value: [number, number] | [number, number, number] | undefined): mod.Vector {
    if (!value) return mod.CreateVector(0, 0, 0);
    return mod.CreateVector(value[0], value[1], value[2] ?? 0);
}

function toColorVector(value: [number, number, number] | undefined): mod.Vector {
    if (!value) return mod.CreateVector(0, 0, 0);
    return mod.CreateVector(value[0], value[1], value[2]);
}

function toMessage(value: mod.Message | string | number | undefined): mod.Message {
    if (value === undefined) return mod.Message('');
    if (typeof value === 'string' || typeof value === 'number') return mod.Message(value);
    return value;
}

function parseUiNode(node: ParseUiNode, parent?: mod.UIWidget): mod.UIWidget {
    const position = toVector(node.position);
    const size = toVector(node.size);
    const anchor = node.anchor ?? mod.UIAnchor.TopLeft;
    const visible = node.visible ?? true;
    const padding = node.padding ?? 0;
    const bgColor = toColorVector(node.bgColor);
    const bgAlpha = node.bgAlpha ?? 0;
    const bgFill = node.bgFill ?? mod.UIBgFill.None;
    const receiver = node.playerId;
    const effectiveParent = parent ?? mod.GetUIRoot();

    if (node.type === 'Container') {
        if (effectiveParent && receiver) {
            mod.AddUIContainer(
                node.name,
                position,
                size,
                anchor,
                effectiveParent,
                visible,
                padding,
                bgColor,
                bgAlpha,
                bgFill,
                receiver
            );
        } else if (effectiveParent) {
            mod.AddUIContainer(node.name, position, size, anchor, effectiveParent, visible, padding, bgColor, bgAlpha, bgFill);
        } else if (receiver) {
            mod.AddUIContainer(node.name, position, size, anchor, receiver);
        } else {
            mod.AddUIContainer(node.name, position, size, anchor);
        }
    } else {
        const message = toMessage(node.textLabel);
        const textColor = toColorVector(node.textColor);
        const textAlpha = node.textAlpha ?? 1;
        const textSize = node.textSize ?? 20;
        const textAnchor = node.textAnchor ?? mod.UIAnchor.Center;

        if (effectiveParent && receiver) {
            mod.AddUIText(
                node.name,
                position,
                size,
                anchor,
                effectiveParent,
                visible,
                padding,
                bgColor,
                bgAlpha,
                bgFill,
                message,
                textSize,
                textColor,
                textAlpha,
                textAnchor,
                receiver
            );
        } else if (effectiveParent) {
            mod.AddUIText(
                node.name,
                position,
                size,
                anchor,
                effectiveParent,
                visible,
                padding,
                bgColor,
                bgAlpha,
                bgFill,
                message,
                textSize,
                textColor,
                textAlpha,
                textAnchor
            );
        } else if (receiver) {
            mod.AddUIText(node.name, position, size, anchor, message, receiver);
        } else {
            mod.AddUIText(node.name, position, size, anchor, message);
        }
    }

    let widget = mod.FindUIWidgetWithName(node.name) as mod.UIWidget;
    if (!widget && effectiveParent) {
        try {
            widget = mod.FindUIWidgetWithName(node.name, effectiveParent) as mod.UIWidget;
        } catch {}
    }
    if (!widget) {
        try {
            const root = mod.GetUIRoot();
            if (root) {
                widget = mod.FindUIWidgetWithName(node.name, root) as mod.UIWidget;
            }
        } catch {}
    }

    if (node.children && widget) {
        for (const child of node.children) {
            parseUiNode(child, widget);
        }
    }

    return widget;
}

export function equals(a: unknown, b: unknown): boolean {
    return a === b || mod.Equals(a, b);
}

export function getPlayerId(player: mod.Player): number {
    return mod.GetObjId(player);
}

export function getTeamId(team: mod.Team): number {
    if (mod.Equals(team, mod.GetTeam(1))) return 1;
    if (mod.Equals(team, mod.GetTeam(2))) return 2;
    return 0;
}

export function showHighlightedGameModeMessage(message: mod.Message, receiver?: mod.Player | mod.Team): void {
    if (receiver) {
        mod.DisplayNotificationMessage(message, receiver as any);
        return;
    }

    mod.DisplayNotificationMessage(message);
}

export const modlib = {
    Equals: equals,
    getPlayerId,
    getTeamId,
    ParseUI: parseUiNode,
    ShowHighlightedGameModeMessage: showHighlightedGameModeMessage,
};
