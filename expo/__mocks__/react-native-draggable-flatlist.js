const React = require("react");
const { FlatList } = require("react-native");

function DraggableFlatList(props) {
  const { data, renderItem, keyExtractor, testID, ...rest } = props;
  return React.createElement(FlatList, {
    data,
    keyExtractor,
    testID,
    renderItem: ({ item, index }) =>
      renderItem({
        item,
        getIndex: () => index,
        drag: () => {},
        isActive: false,
      }),
    ...rest,
  });
}

function PassThrough({ children }) {
  return children;
}

module.exports = DraggableFlatList;
module.exports.default = DraggableFlatList;
module.exports.ScaleDecorator = PassThrough;
module.exports.ShadowDecorator = PassThrough;
module.exports.OpacityDecorator = PassThrough;
