import pytest
from unittest.mock import patch, Mock
from user_service import UserService

@patch('user_service.requests.get')
def test_get_user_avatar_success(mock_get):
    # Setup mock response
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"avatar_url": "https://avatar.url/123"}
    mock_get.return_value = mock_response

    service = UserService()
    avatar = service.get_avatar("123")
    
    assert avatar == "https://avatar.url/123"
    mock_get.assert_called_once_with("https://api.github.com/users/123")

@patch('user_service.requests.get')
def test_get_user_avatar_failure(mock_get):
    # Setup mock response
    mock_response = Mock()
    mock_response.status_code = 404
    mock_get.return_value = mock_response

    service = UserService()
    with pytest.raises(ValueError, match="User not found"):
        service.get_avatar("missing_user")
